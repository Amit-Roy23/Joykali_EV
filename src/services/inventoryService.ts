import { Vehicle } from "@/models/Vehicle";
import { Dealer } from "@/models/Dealer";
import { StockMovement } from "@/models/StockMovement";
import { withTransaction } from "@/lib/db";
import { JWTPayload } from "@/types";
import mongoose from "mongoose";

export async function bulkAllocateVehiclesToDealer(
  vehicleIds: string[],
  dealerId: string,
  user: JWTPayload,
  notes?: string
): Promise<{ success: boolean; count: number }> {
  return await withTransaction(async (session) => {
    const dealer = await Dealer.findById(dealerId).session(session ?? null);
    if (!dealer) {
      throw new Error("Dealer not found");
    }

    const objectIds = vehicleIds.map((id) => new mongoose.Types.ObjectId(id));
    const vehicles = await Vehicle.find({
      _id: { $in: objectIds },
      status: "IN_STOCK",
    }).session(session ?? null);

    if (vehicles.length === 0) {
      throw new Error("None of the selected vehicles are currently IN_STOCK");
    }

    const movements: any[] = [];
    for (const v of vehicles) {
      v.status = "ALLOCATED_TO_DEALER";
      v.currentLocationType = "DEALER";
      v.currentLocationDealer = dealer._id as mongoose.Types.ObjectId;
      await v.save({ session });

      movements.push({
        vehicle: v._id,
        movementType: "DEALER_ALLOCATION",
        fromLocation: "Main Warehouse",
        toLocation: `Dealer: ${dealer.name} (${dealer.dealerCode})`,
        performedBy: new mongoose.Types.ObjectId(user.userId),
        reference: dealer.dealerCode,
        notes: notes || "Batch dealer allocation",
        timestamp: new Date(),
      });
    }

    await StockMovement.insertMany(movements, { session });

    return { success: true, count: vehicles.length };
  });
}

export async function returnVehicleToWarehouse(
  vehicleId: string,
  user: JWTPayload,
  reason: string
): Promise<{ success: boolean }> {
  return await withTransaction(async (session) => {
    const vehicle = await Vehicle.findById(vehicleId).session(session ?? null);
    if (!vehicle) {
      throw new Error("Vehicle not found");
    }

    const prevLocation =
      vehicle.currentLocationType === "DEALER"
        ? `Dealer: ${vehicle.currentLocationDealer}`
        : "Current Location";

    vehicle.status = "IN_STOCK";
    vehicle.currentLocationType = "WAREHOUSE";
    vehicle.currentLocationDealer = null;
    await vehicle.save({ session });

    await StockMovement.create(
      [
        {
          vehicle: vehicle._id,
          movementType: "RETURN",
          fromLocation: prevLocation,
          toLocation: "Main Warehouse",
          performedBy: new mongoose.Types.ObjectId(user.userId),
          notes: reason || "Returned to main warehouse",
          timestamp: new Date(),
        },
      ],
      { session }
    );

    return { success: true };
  });
}

