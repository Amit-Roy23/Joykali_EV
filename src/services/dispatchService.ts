import mongoose from "mongoose";
import { JWTPayload, isPartnerRole } from "@/types";
import { ChannelOrder } from "@/models/ChannelOrder";
import { DeliveryOrder, IDeliveryOrder } from "@/models/DeliveryOrder";
import { FleetVehicle } from "@/models/FleetVehicle";
import { Vehicle } from "@/models/Vehicle";
import { StockMovement } from "@/models/StockMovement";
import { LedgerEntry } from "@/models/LedgerEntry";
import { Setting } from "@/models/Setting";
import { User } from "@/models/User";
import { generateFyCode } from "@/lib/codeGenerator";
import { canAccessParty, distributorOf } from "@/lib/partyAccess";
import { fleetCompliance } from "@/lib/fleet";
import { documentTotals, ewbValidUpto, isEwbNumber } from "@/lib/gstDocs";
import { logAudit } from "@/lib/audit";
import { assertCredit, getParty, lineValue } from "./creditService";
import { refreshOrderStatus } from "./orderService";

export class DispatchError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

const oid = (id: string | mongoose.Types.ObjectId) =>
  new mongoose.Types.ObjectId(String(id));

async function loadDO(id: string) {
  if (!mongoose.isValidObjectId(id))
    throw new DispatchError("Delivery order not found", 404);
  const d = await DeliveryOrder.findById(id);
  if (!d) throw new DispatchError("Delivery order not found", 404);
  return d;
}

function expect(d: IDeliveryOrder, ...allowed: string[]) {
  if (!allowed.includes(d.status)) {
    throw new DispatchError(
      `Not allowed while the DO is ${d.status.toLowerCase().replace(/_/g, " ")}`,
    );
  }
}

function stamp(
  d: IDeliveryOrder,
  status: string,
  user: JWTPayload,
  note?: string,
) {
  d.timeline.push({
    status,
    by: oid(user.userId),
    byName: user.name,
    at: new Date(),
    note,
  });
}

async function logisticsSettings() {
  const s: any = await Setting.findOne().lean();
  return {
    company: s,
    threshold: s?.logistics?.ewayBillThresholdPaise ?? 5000000,
    separateDispatcher: s?.logistics?.requireSeparateDispatcher ?? true,
    warnDays: s?.logistics?.docExpiryWarningDays ?? 15,
  };
}

/** Is this fleet vehicle usable right now? Returns the reasons if not. */
export async function assertFleetUsable(
  fleetId: string | mongoose.Types.ObjectId,
  exceptDO?: mongoose.Types.ObjectId,
) {
  const fleet = await FleetVehicle.findById(fleetId).lean();
  if (!fleet) throw new DispatchError("Transport vehicle not found", 404);
  const { warnDays } = await logisticsSettings();
  const c = fleetCompliance(fleet as any, new Date(), warnDays);
  if (c.locked)
    throw new DispatchError(
      `${fleet.registrationNo} is LOCKED: ${c.reasons.join("; ")}`,
    );
  const busy = await DeliveryOrder.findOne({
    "loading.fleetVehicle": fleet._id,
    status: { $in: ["LOADING", "LOADED", "DISPATCHED"] },
    ...(exceptDO ? { _id: { $ne: exceptDO } } : {}),
  })
    .select("doCode status")
    .lean();
  if (busy) {
    throw new DispatchError(
      `${fleet.registrationNo} is already on ${busy.doCode} (${busy.status.toLowerCase()}). It can be reused once that delivery is received.`,
    );
  }
  return fleet;
}

/* ------------------------------------------------------------------ */
/* 1. Create a DO from an approved order                               */
/* ------------------------------------------------------------------ */
export async function createDeliveryOrder(
  orderId: string,
  lines: Array<{ modelId: string; quantity: number }>,
  user: JWTPayload,
) {
  if (!mongoose.isValidObjectId(orderId))
    throw new DispatchError("Order not found", 404);
  const order = await ChannelOrder.findById(orderId);
  if (!order) throw new DispatchError("Order not found", 404);
  if (!["APPROVED", "PARTIALLY_DISPATCHED"].includes(order.status)) {
    throw new DispatchError(
      "A delivery order can only be raised against an order approved by the Business Head and the Managing Partner",
    );
  }
  const party = await getParty(order.partyType, order.party);
  if (!party) throw new DispatchError("Party not found", 404);

  const doLines = [];
  for (const req of lines || []) {
    const q = Math.floor(Number(req.quantity));
    if (!q || q < 1) continue;
    const line = order.lines.find(
      (l) => String(l.model) === String(req.modelId),
    );
    if (!line)
      throw new DispatchError("A model on the DO is not on the order", 400);
    const remaining = line.quantity - (line.dispatchedQty || 0);
    if (q > remaining)
      throw new DispatchError(
        `${line.modelName}: only ${remaining} unit(s) left on the order`,
        400,
      );
    // Only what the warehouse actually has can be promised.
    const free = await Vehicle.countDocuments({
      model: line.model,
      status: "IN_STOCK",
      currentLocationType: "WAREHOUSE",
    });
    if (q > free)
      throw new DispatchError(
        `${line.modelName}: only ${free} unit(s) in warehouse stock`,
        400,
      );
    doLines.push({
      model: line.model,
      modelName: line.modelName,
      quantity: q,
      unitPrice: line.unitPrice,
      gstRate: line.gstRate,
      hsnCode: line.hsnCode,
    });
  }
  if (doLines.length === 0)
    throw new DispatchError("Choose at least one unit to deliver", 400);

  // Reserve the quantities on the order with optimistic concurrency, so two
  // people raising DOs at the same moment can't over-commit the same order.
  const applied: typeof doLines = [];
  try {
    for (const l of doLines) {
      let done = false;
      for (let attempt = 0; attempt < 5 && !done; attempt++) {
        const fresh = await ChannelOrder.findById(order._id).lean();
        const fl = fresh!.lines.find(
          (x) => String(x.model) === String(l.model),
        )!;
        const current = fl.dispatchedQty || 0;
        if (fl.quantity - current < l.quantity) {
          throw new DispatchError(
            `${l.modelName}: only ${fl.quantity - current} unit(s) left on the order`,
          );
        }
        const res = await ChannelOrder.updateOne(
          {
            _id: order._id,
            lines: { $elemMatch: { model: l.model, dispatchedQty: current } },
          },
          { $inc: { "lines.$.dispatchedQty": l.quantity } },
        );
        done = res.modifiedCount === 1;
      }
      if (!done)
        throw new DispatchError(
          "The order changed while saving — please try again",
        );
      applied.push(l);
    }
  } catch (e) {
    // Undo the lines already reserved so the order stays consistent.
    for (const l of applied) {
      await ChannelOrder.updateOne(
        { _id: order._id, "lines.model": l.model },
        { $inc: { "lines.$.dispatchedQty": -l.quantity } },
      );
    }
    throw e;
  }

  const d = await DeliveryOrder.create({
    doCode: await generateFyCode("DO"),
    order: order._id,
    orderCode: order.orderCode,
    partyType: order.partyType,
    party: order.party,
    partySnapshot: {
      name: party.name,
      code: party.code,
      gstin: party.gstin || "",
      address: party.address || "",
      city: party.city || "",
      stateCode: party.stateCode || "19",
      pincode: party.pincode || "",
    },
    lines: doLines,
    vehicles: [],
    status: "CREATED",
    ewayBill: { required: true },
    timeline: [
      {
        status: "CREATED",
        by: oid(user.userId),
        byName: user.name,
        at: new Date(),
      },
    ],
    createdBy: oid(user.userId),
  });
  await refreshOrderStatus(order._id as mongoose.Types.ObjectId);
  await logAudit({
    user,
    action: "CREATE",
    resource: "DELIVERY_ORDER",
    resourceId: String(d._id),
    after: { doCode: d.doCode, order: order.orderCode },
  });
  return d;
}

/* ------------------------------------------------------------------ */
/* 2. Warehouse submits the DO (lines are frozen from here)            */
/* ------------------------------------------------------------------ */
export async function submitDO(id: string, user: JWTPayload) {
  const d = await loadDO(id);
  expect(d, "CREATED");
  d.status = "SUBMITTED";
  stamp(d, "SUBMITTED", user, "Warehouse DO submitted for loading");
  await d.save();
  await logAudit({
    user,
    action: "SUBMIT",
    resource: "DELIVERY_ORDER",
    resourceId: id,
  });
  return d;
}

/* ------------------------------------------------------------------ */
/* 3. Start loading: assign a compliant transport vehicle and driver   */
/* ------------------------------------------------------------------ */
export async function startLoading(
  id: string,
  input: {
    fleetVehicleId: string;
    driverName: string;
    driverPhone: string;
    driverLicence: string;
  },
  user: JWTPayload,
) {
  const d = await loadDO(id);
  expect(d, "SUBMITTED");
  if (!input.driverName?.trim())
    throw new DispatchError("Driver name is required", 400);
  if (!/^[6-9]\d{9}$/.test((input.driverPhone || "").trim()))
    throw new DispatchError("Enter the driver's 10-digit mobile number", 400);
  if (!input.driverLicence?.trim() || input.driverLicence.trim().length < 8) {
    throw new DispatchError("Enter the driver's licence number", 400);
  }
  const fleet = await assertFleetUsable(
    input.fleetVehicleId,
    d._id as mongoose.Types.ObjectId,
  );
  const units = d.lines.reduce((s, l) => s + l.quantity, 0);
  if (units > fleet.capacityUnits) {
    throw new DispatchError(
      `${fleet.registrationNo} carries ${fleet.capacityUnits} units; this DO has ${units}. Split the DO or use a bigger vehicle.`,
    );
  }
  d.loading = {
    fleetVehicle: fleet._id as mongoose.Types.ObjectId,
    registrationNo: fleet.registrationNo,
    driverName: input.driverName.trim(),
    driverPhone: input.driverPhone.trim(),
    driverLicence: input.driverLicence.trim().toUpperCase(),
    checklist: {
      physicalInspection: false,
      chassisVerified: false,
      batteryChargerKeys: false,
      securedForTransit: false,
    },
    startedBy: oid(user.userId),
    startedAt: new Date(),
  };
  d.status = "LOADING";
  stamp(
    d,
    "LOADING",
    user,
    `${fleet.registrationNo} · driver ${input.driverName.trim()}`,
  );
  await d.save();
  await logAudit({
    user,
    action: "LOAD",
    resource: "DELIVERY_ORDER",
    resourceId: id,
    after: { fleet: fleet.registrationNo },
  });
  return d;
}

/* ------------------------------------------------------------------ */
/* 4. Pick chassis onto the DO (reserves stock; scanner or typed)      */
/* ------------------------------------------------------------------ */
export async function pickVehicle(
  id: string,
  chassisNumber: string,
  user: JWTPayload,
) {
  const d = await loadDO(id);
  expect(d, "LOADING");
  const chassis = (chassisNumber || "").trim().toUpperCase();
  if (!chassis) throw new DispatchError("Scan or type a chassis number", 400);
  if (d.vehicles.some((v) => v.chassisNumber === chassis))
    throw new DispatchError(`${chassis} is already on this DO`);
  const vehicle = await Vehicle.findOne({ chassisNumber: chassis })
    .populate("model", "name variant")
    .lean();
  if (!vehicle)
    throw new DispatchError(`No vehicle with chassis ${chassis}`, 404);
  const line = d.lines.find(
    (l) => String(l.model) === String((vehicle.model as any)._id),
  );
  if (!line)
    throw new DispatchError(
      `${chassis} is a ${(vehicle.model as any).name} — not on this DO`,
    );
  const picked = d.vehicles.filter(
    (v) => String(v.model) === String(line.model),
  ).length;
  if (picked >= line.quantity)
    throw new DispatchError(
      `${line.modelName}: all ${line.quantity} unit(s) already picked`,
    );

  // Atomic reservation — fails if someone else took or sold it meanwhile.
  const reserved = await Vehicle.findOneAndUpdate(
    { _id: vehicle._id, status: "IN_STOCK", currentLocationType: "WAREHOUSE" },
    { $set: { status: "RESERVED", deliveryOrder: d._id } },
    { new: true },
  );
  if (!reserved)
    throw new DispatchError(
      `${chassis} is not free warehouse stock (status ${vehicle.status.toLowerCase().replace(/_/g, " ")})`,
    );

  d.vehicles.push({
    vehicle: reserved._id as mongoose.Types.ObjectId,
    model: line.model,
    modelName: line.modelName,
    chassisNumber: reserved.chassisNumber,
    motorNumber: reserved.motorNumber,
    batteryNumber: reserved.batteryNumber,
    color: reserved.color,
    pickedBy: oid(user.userId),
    pickedAt: new Date(),
  });
  await d.save();
  await StockMovement.create({
    vehicle: reserved._id,
    movementType: "DO_RESERVE",
    fromLocation: "Main Warehouse",
    toLocation: `Loading bay — ${d.doCode}`,
    performedBy: oid(user.userId),
    reference: d.doCode,
    notes: `Picked for ${d.partySnapshot.name}`,
    timestamp: new Date(),
  });
  return d;
}

export async function unpickVehicle(
  id: string,
  vehicleId: string,
  user: JWTPayload,
) {
  const d = await loadDO(id);
  expect(d, "LOADING");
  const idx = d.vehicles.findIndex(
    (v) => String(v.vehicle) === String(vehicleId),
  );
  if (idx === -1)
    throw new DispatchError("That vehicle is not on this DO", 404);
  const [removed] = d.vehicles.splice(idx, 1);
  await Vehicle.updateOne(
    { _id: removed.vehicle, status: "RESERVED", deliveryOrder: d._id },
    { $set: { status: "IN_STOCK", deliveryOrder: null } },
  );
  await d.save();
  await StockMovement.create({
    vehicle: removed.vehicle,
    movementType: "DO_RELEASE",
    fromLocation: `Loading bay — ${d.doCode}`,
    toLocation: "Main Warehouse",
    performedBy: oid(user.userId),
    reference: d.doCode,
    notes: "Removed from DO",
    timestamp: new Date(),
  });
  return d;
}

/** Fill every open slot with the oldest free warehouse stock of that model (FIFO). */
export async function autoPick(id: string, user: JWTPayload) {
  const d = await loadDO(id);
  expect(d, "LOADING");
  for (const line of d.lines) {
    const need =
      line.quantity -
      d.vehicles.filter((v) => String(v.model) === String(line.model)).length;
    if (need <= 0) continue;
    const candidates = await Vehicle.find({
      model: line.model,
      status: "IN_STOCK",
      currentLocationType: "WAREHOUSE",
    })
      .sort({ createdAt: 1 })
      .limit(need + 5)
      .select("chassisNumber")
      .lean();
    let got = 0;
    for (const c of candidates) {
      if (got >= need) break;
      try {
        await pickVehicle(id, c.chassisNumber, user);
        got++;
      } catch {
        // taken by someone else between query and reserve — try the next one
      }
    }
    if (got < need)
      throw new DispatchError(
        `${line.modelName}: only ${got} of ${need} unit(s) available in the warehouse`,
      );
  }
  return loadDO(id);
}

/* ------------------------------------------------------------------ */
/* 5. Complete loading: everything picked + checklist signed           */
/* ------------------------------------------------------------------ */
export async function completeLoading(
  id: string,
  checklist: {
    physicalInspection: boolean;
    chassisVerified: boolean;
    batteryChargerKeys: boolean;
    securedForTransit: boolean;
  },
  user: JWTPayload,
) {
  const d = await loadDO(id);
  expect(d, "LOADING");
  for (const line of d.lines) {
    const n = d.vehicles.filter(
      (v) => String(v.model) === String(line.model),
    ).length;
    if (n !== line.quantity)
      throw new DispatchError(
        `${line.modelName}: ${n} of ${line.quantity} picked`,
      );
  }
  const keys = [
    "physicalInspection",
    "chassisVerified",
    "batteryChargerKeys",
    "securedForTransit",
  ] as const;
  const missing = keys.filter((k) => !checklist?.[k]);
  if (missing.length)
    throw new DispatchError(
      "Complete every item on the loading checklist",
      400,
    );
  d.loading!.checklist = {
    physicalInspection: true,
    chassisVerified: true,
    batteryChargerKeys: true,
    securedForTransit: true,
  };
  d.loading!.loadedBy = oid(user.userId);
  d.loading!.loadedByName = user.name;
  d.loading!.loadedAt = new Date();
  d.status = "LOADED";
  stamp(
    d,
    "LOADED",
    user,
    `${d.vehicles.length} vehicle(s) loaded on ${d.loading!.registrationNo}`,
  );
  await d.save();
  await logAudit({
    user,
    action: "LOAD",
    resource: "DELIVERY_ORDER",
    resourceId: id,
    after: { loaded: d.vehicles.length },
  });
  return d;
}

/* ------------------------------------------------------------------ */
/* 6. Generate the tax invoice / delivery challan                      */
/* ------------------------------------------------------------------ */
export async function generateDocument(id: string, user: JWTPayload) {
  const d = await loadDO(id);
  expect(d, "LOADED");
  if (d.document?.number) return d; // idempotent
  const { company, threshold } = await logisticsSettings();
  const totals = documentTotals(
    d.lines,
    company?.stateCode || "19",
    d.partySnapshot.stateCode || "19",
  );
  const kind =
    d.partyType === "DISTRIBUTOR" ? "TAX_INVOICE" : "DELIVERY_CHALLAN";
  d.document = {
    kind,
    number: await generateFyCode(
      kind === "TAX_INVOICE" ? "INVOICE" : "CHALLAN",
    ),
    date: new Date(),
    interState: totals.interState,
    taxableValue: totals.taxableValue,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    totalValue: totals.totalValue,
  };
  d.ewayBill.required = totals.totalValue >= threshold;
  stamp(
    d,
    "DOCUMENT",
    user,
    `${kind === "TAX_INVOICE" ? "Tax invoice" : "Delivery challan"} ${d.document.number}`,
  );
  await d.save();
  return d;
}

/* ------------------------------------------------------------------ */
/* 7. Record the e-way bill generated on the NIC portal                */
/* ------------------------------------------------------------------ */
export async function recordEwayBill(
  id: string,
  input: { distanceKm: number; ewbNo?: string; ewbDate?: string },
  user: JWTPayload,
) {
  const d = await loadDO(id);
  expect(d, "LOADED");
  if (!d.document?.number)
    throw new DispatchError(
      "Generate the invoice/challan first — the e-way bill quotes its number",
    );
  const km = Math.round(Number(input.distanceKm));
  if (!km || km < 1 || km > 4000)
    throw new DispatchError(
      "Enter the approximate road distance (1–4000 km)",
      400,
    );
  d.ewayBill.distanceKm = km;
  if (input.ewbNo) {
    const no = input.ewbNo.replace(/\s/g, "");
    if (!isEwbNumber(no))
      throw new DispatchError("An e-way bill number has 12 digits", 400);
    const dup = await DeliveryOrder.findOne({
      "ewayBill.ewbNo": no,
      _id: { $ne: d._id },
    })
      .select("doCode")
      .lean();
    if (dup)
      throw new DispatchError(`EWB ${no} is already used on ${dup.doCode}`);
    const at = input.ewbDate ? new Date(input.ewbDate) : new Date();
    if (Number.isNaN(+at) || at > new Date(Date.now() + 5 * 60000))
      throw new DispatchError("E-way bill date cannot be in the future", 400);
    if (
      at < d.document.date &&
      d.document.date.getTime() - at.getTime() > 86400000
    ) {
      throw new DispatchError(
        "The e-way bill cannot pre-date the invoice",
        400,
      );
    }
    d.ewayBill.ewbNo = no;
    d.ewayBill.ewbDate = at;
    d.ewayBill.validUpto = ewbValidUpto(at, km);
    d.ewayBill.enteredBy = oid(user.userId);
    stamp(
      d,
      "EWAY_BILL",
      user,
      `EWB ${no}, valid until ${d.ewayBill.validUpto.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
    );
  }
  d.markModified("ewayBill");
  await d.save();
  return d;
}

/* ------------------------------------------------------------------ */
/* 8. Dispatch (gate-out) — every control is re-checked here           */
/* ------------------------------------------------------------------ */
export async function dispatchDO(id: string, user: JWTPayload) {
  const d = await loadDO(id);
  expect(d, "LOADED");
  const { separateDispatcher } = await logisticsSettings();

  if (!d.document?.number)
    throw new DispatchError("Generate the invoice/challan before dispatch");
  if (d.ewayBill.required) {
    if (!d.ewayBill.ewbNo)
      throw new DispatchError(
        "This consignment needs an e-way bill — record the EWB number before dispatch",
      );
    if (d.ewayBill.validUpto && d.ewayBill.validUpto < new Date()) {
      throw new DispatchError(
        "The e-way bill has expired — extend it on the portal and record the new validity",
      );
    }
  }
  if (
    separateDispatcher &&
    d.loading?.loadedBy &&
    String(d.loading.loadedBy) === String(user.userId)
  ) {
    throw new DispatchError(
      "Segregation of duties: the person who completed loading cannot also dispatch. Ask another authorised person.",
      403,
    );
  }
  // Transport papers must still be valid at the gate.
  await assertFleetUsable(
    d.loading!.fleetVehicle,
    d._id as mongoose.Types.ObjectId,
  );
  // Every chassis must still be reserved for this DO.
  const stillReserved = await Vehicle.countDocuments({
    _id: { $in: d.vehicles.map((v) => v.vehicle) },
    status: "RESERVED",
    deliveryOrder: d._id,
  });
  if (stillReserved !== d.vehicles.length)
    throw new DispatchError(
      "Some picked vehicles are no longer reserved — re-check the load",
    );
  // Credit: this DO is already inside the party's exposure; re-check in case the limit was cut or dues went overdue.
  await assertCredit(d.partyType, d.party, 0, {
    context: `dispatch ${d.doCode}`,
  }).catch((e) => {
    throw new DispatchError(e.message);
  });

  const now = new Date();
  await Vehicle.updateMany(
    { _id: { $in: d.vehicles.map((v) => v.vehicle) } },
    { $set: { status: "IN_TRANSIT", currentLocationType: "IN_TRANSIT" } },
  );
  await StockMovement.insertMany(
    d.vehicles.map((v) => ({
      vehicle: v.vehicle,
      movementType: "DISPATCH",
      fromLocation: "Main Warehouse",
      toLocation: `In transit to ${d.partySnapshot.name} (${d.loading!.registrationNo})`,
      performedBy: oid(user.userId),
      reference: `${d.doCode} / ${d.document!.number}`,
      notes: d.ewayBill.ewbNo ? `EWB ${d.ewayBill.ewbNo}` : undefined,
      timestamp: now,
    })),
  );
  if (d.partyType === "DISTRIBUTOR") {
    await LedgerEntry.create({
      partyType: "DISTRIBUTOR",
      party: d.party,
      date: d.document.date,
      type: "INVOICE",
      reference: d.document.number,
      debit: d.document.totalValue,
      credit: 0,
      narration: `${d.vehicles.length} vehicle(s) · ${d.doCode}`,
      deliveryOrder: d._id,
      createdBy: oid(user.userId),
    });
  }
  d.dispatch = { by: oid(user.userId), byName: user.name, at: now };
  d.status = "DISPATCHED";
  stamp(d, "DISPATCHED", user, `Gate-out on ${d.loading!.registrationNo}`);
  await d.save();
  await logAudit({
    user,
    action: "DISPATCH",
    resource: "DELIVERY_ORDER",
    resourceId: id,
    after: { document: d.document.number, ewb: d.ewayBill.ewbNo },
  });
  return d;
}

/* ------------------------------------------------------------------ */
/* 9. GRN — the receiver confirms what arrived                          */
/* ------------------------------------------------------------------ */
export async function recordGRN(
  id: string,
  input: {
    items: Array<{
      vehicleId: string;
      condition: "RECEIVED" | "DAMAGED" | "SHORT";
      remarks?: string;
    }>;
    remarks?: string;
  },
  user: JWTPayload,
) {
  const d = await loadDO(id);
  expect(d, "DISPATCHED");
  if (isPartnerRole(user.role)) {
    if (!(await canAccessParty(user, d.partyType, d.party)))
      throw new DispatchError("Delivery order not found", 404);
  } else if (!(await canAccessParty(user, d.partyType, d.party))) {
    throw new DispatchError(
      "You can only record receipts for your own dealers/distributors",
      403,
    );
  }

  const byVehicle = new Map(
    (input.items || []).map((i) => [String(i.vehicleId), i]),
  );
  if (d.vehicles.some((v) => !byVehicle.has(String(v.vehicle)))) {
    throw new DispatchError(
      "Mark every vehicle on the delivery as received, damaged or short",
      400,
    );
  }
  for (const i of byVehicle.values()) {
    if (!["RECEIVED", "DAMAGED", "SHORT"].includes(i.condition))
      throw new DispatchError("Invalid condition", 400);
    if (i.condition !== "RECEIVED" && !i.remarks?.trim())
      throw new DispatchError(
        "Add a remark for every damaged or short vehicle",
        400,
      );
  }

  const now = new Date();
  const items = d.vehicles.map((v) => {
    const i = byVehicle.get(String(v.vehicle))!;
    return {
      vehicle: v.vehicle,
      chassisNumber: v.chassisNumber,
      condition: i.condition,
      remarks: i.remarks?.trim(),
    };
  });
  const arrived = items
    .filter((i) => i.condition !== "SHORT")
    .map((i) => i.vehicle);
  const short = items.filter((i) => i.condition === "SHORT");

  if (arrived.length) {
    await Vehicle.updateMany(
      { _id: { $in: arrived } },
      d.partyType === "DEALER"
        ? {
            $set: {
              status: "ALLOCATED_TO_DEALER",
              currentLocationType: "DEALER",
              currentLocationDealer: d.party,
              deliveryOrder: null,
            },
          }
        : {
            $set: {
              status: "WITH_DISTRIBUTOR",
              currentLocationType: "DISTRIBUTOR",
              currentLocationDistributor: d.party,
              deliveryOrder: null,
            },
          },
    );
  }
  if (short.length) {
    await Vehicle.updateMany(
      { _id: { $in: short.map((s) => s.vehicle) } },
      { $set: { status: "MISSING" } },
    );
  }
  await StockMovement.insertMany(
    items.map((i) => ({
      vehicle: i.vehicle,
      movementType: i.condition === "SHORT" ? "SHORTAGE" : "DELIVERY",
      fromLocation: `In transit (${d.loading!.registrationNo})`,
      toLocation:
        i.condition === "SHORT"
          ? "Reported short — under investigation"
          : `${d.partyType === "DEALER" ? "Dealer" : "Distributor"}: ${d.partySnapshot.name}`,
      performedBy: oid(user.userId),
      reference: d.doCode,
      notes:
        i.remarks ||
        (i.condition === "DAMAGED" ? "Received damaged" : undefined),
      timestamp: now,
    })),
  );

  // Short-delivered units on a tax invoice are credited back to the distributor.
  let creditNoteNo: string | undefined;
  let creditNoteValue = 0;
  if (d.partyType === "DISTRIBUTOR" && short.length) {
    for (const s of short) {
      const v = d.vehicles.find(
        (x) => String(x.vehicle) === String(s.vehicle),
      )!;
      const line = d.lines.find((l) => String(l.model) === String(v.model))!;
      creditNoteValue += lineValue(1, line.unitPrice, line.gstRate).total;
    }
    creditNoteNo = await generateFyCode("CREDIT_NOTE");
    await LedgerEntry.create({
      partyType: "DISTRIBUTOR",
      party: d.party,
      date: now,
      type: "CREDIT_NOTE",
      reference: creditNoteNo,
      debit: 0,
      credit: creditNoteValue,
      narration: `Short delivery on ${d.document?.number}: ${short.map((s) => s.chassisNumber).join(", ")}`,
      deliveryOrder: d._id,
      createdBy: oid(user.userId),
    });
  }

  const issues = items.some((i) => i.condition !== "RECEIVED");
  d.grn = {
    grnNo: await generateFyCode("GRN"),
    receivedBy: oid(user.userId),
    receivedByName: user.name,
    at: now,
    items,
    remarks: input.remarks?.trim(),
    creditNoteNo,
    creditNoteValue: creditNoteValue || undefined,
  };
  d.status = issues ? "DELIVERED_WITH_ISSUES" : "DELIVERED";
  stamp(
    d,
    d.status,
    user,
    `GRN ${d.grn.grnNo}${issues ? " — with exceptions" : ""}`,
  );
  await d.save();
  await logAudit({
    user,
    action: "RECEIVE",
    resource: "DELIVERY_ORDER",
    resourceId: id,
    after: { grn: d.grn.grnNo, issues },
  });
  return d;
}

/* ------------------------------------------------------------------ */
/* Cancel (any time before dispatch) — releases every reservation      */
/* ------------------------------------------------------------------ */
export async function cancelDO(id: string, reason: string, user: JWTPayload) {
  const d = await loadDO(id);
  expect(d, "CREATED", "SUBMITTED", "LOADING", "LOADED");
  if (!reason?.trim()) throw new DispatchError("A reason is required", 400);
  if (d.vehicles.length) {
    await Vehicle.updateMany(
      {
        _id: { $in: d.vehicles.map((v) => v.vehicle) },
        status: "RESERVED",
        deliveryOrder: d._id,
      },
      { $set: { status: "IN_STOCK", deliveryOrder: null } },
    );
    await StockMovement.insertMany(
      d.vehicles.map((v) => ({
        vehicle: v.vehicle,
        movementType: "DO_RELEASE",
        fromLocation: `Loading bay — ${d.doCode}`,
        toLocation: "Main Warehouse",
        performedBy: oid(user.userId),
        reference: d.doCode,
        notes: `DO cancelled: ${reason.trim()}`,
        timestamp: new Date(),
      })),
    );
  }
  // Give the quantities back to the order.
  const order = await ChannelOrder.findById(d.order);
  if (order) {
    for (const l of d.lines) {
      const ol = order.lines.find((x) => String(x.model) === String(l.model));
      if (ol)
        ol.dispatchedQty = Math.max(0, (ol.dispatchedQty || 0) - l.quantity);
    }
    if (order.status === "COMPLETED" && !order.cancelledReason)
      order.status = "PARTIALLY_DISPATCHED";
    await order.save();
    await refreshOrderStatus(order._id as mongoose.Types.ObjectId);
  }
  d.status = "CANCELLED";
  stamp(
    d,
    "CANCELLED",
    user,
    `${reason.trim()}${d.document?.number ? ` — ${d.document.number} void` : ""}`,
  );
  await d.save();
  await logAudit({
    user,
    action: "CANCEL",
    resource: "DELIVERY_ORDER",
    resourceId: id,
    after: { reason },
  });
  return d;
}

/** Who can still act on a DO and what is blocking it — drives the UI checklist. */
export async function doReadiness(d: IDeliveryOrder) {
  const blockers: string[] = [];
  if (d.status === "LOADED") {
    if (!d.document?.number) blockers.push("Generate the invoice / challan");
    if (d.ewayBill.required && !d.ewayBill.ewbNo)
      blockers.push("Record the e-way bill number");
    if (d.ewayBill.validUpto && d.ewayBill.validUpto < new Date())
      blockers.push("E-way bill has expired");
    if (d.loading?.fleetVehicle) {
      try {
        await assertFleetUsable(
          d.loading.fleetVehicle,
          d._id as mongoose.Types.ObjectId,
        );
      } catch (e: any) {
        blockers.push(e.message);
      }
    }
  }
  const loader = d.loading?.loadedBy
    ? await User.findById(d.loading.loadedBy).select("name").lean()
    : null;
  return {
    blockers,
    loadedByName: loader?.name || d.loading?.loadedByName || null,
  };
}
