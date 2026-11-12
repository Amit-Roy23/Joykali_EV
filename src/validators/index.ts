import { z } from "zod";

// Auth
export const LoginSchema = z.object({
  identifier: z.string().min(1, "Employee Code or Email is required"),
  password: z.string().min(1, "Password is required"),
});

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(6, "New password must be at least 6 characters")
      .regex(/[A-Z]/, "Must contain at least one uppercase letter")
      .regex(/[0-9]/, "Must contain at least one number"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const ResetPasswordSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

// Employee
export const EmployeeCreateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().regex(/^[0-9]{10}$/, "Phone must be a valid 10-digit number"),
  role: z.enum(["FEC", "ASM", "BUSINESS_HEAD", "MANAGING_PARTNER", "ADMIN"]),
  reportsTo: z.string().optional().nullable(),
  dealer: z.string().optional().nullable(),
  designation: z.string().min(2, "Designation is required"),
  joiningDate: z.string().or(z.date()),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  salary: z.object({
    basic: z.number().min(0, "Basic salary must be positive"),
    hra: z.number().min(0).default(0),
    conveyance: z.number().min(0).default(0),
    otherAllowances: z.number().min(0).default(0),
    fixedDeductions: z.object({
      pf: z.boolean().default(true),
      esi: z.boolean().default(true),
      professionalTax: z.boolean().default(true),
    }),
    bankDetails: z.object({
      accountNo: z.string().min(6, "Valid account number is required"),
      ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC code format"),
      bankName: z.string().min(2, "Bank name is required"),
    }),
    pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, "Invalid PAN format (e.g. ABCDE1234F)"),
  }),
});

export const EmployeeUpdateSchema = EmployeeCreateSchema.partial();

// Dealer
export const DealerSchema = z.object({
  name: z.string().min(2, "Dealer name is required"),
  ownerName: z.string().min(2, "Owner name is required"),
  phone: z.string().regex(/^[0-9]{10}$/, "Phone must be 10 digits"),
  email: z.string().email("Invalid email"),
  address: z.string().min(5, "Address is required"),
  city: z.string().min(2, "City is required"),
  state: z.string().min(2, "State is required"),
  gstin: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, "Invalid GSTIN format"),
  assignedASM: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

// Vehicle Model
export const VehicleModelSchema = z.object({
  name: z.string().min(2, "Model name is required"),
  variant: z.string().min(1, "Variant is required"),
  category: z.enum(["2W", "3W", "4W", "E_RICKSHAW", "LOADER"]),
  batteryType: z.string().min(2, "Battery type is required"),
  rangeKm: z.number().min(1, "Range in km must be positive"),
  purchasePrice: z.number().min(0, "Purchase price must be positive"), // in rupees in form
  sellingPrice: z.number().min(0, "Selling price must be positive"), // in rupees in form
  gstRate: z.number().min(0).max(28).default(5),
  hsnCode: z.string().default("870380"),
  isActive: z.boolean().default(true),
});

// Vehicle Allocation
export const VehicleAllocateSchema = z.object({
  vehicleIds: z.array(z.string()).min(1, "Select at least one vehicle"),
  dealerId: z.string().min(1, "Dealer is required"),
  notes: z.string().optional(),
});

// Purchase
export const PurchaseLineItemSchema = z.object({
  model: z.string().min(1, "Model is required"),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
  unitCost: z.number().min(0, "Unit cost must be positive"),
  gstRate: z.number().default(5),
  vehicles: z
    .array(
      z.object({
        chassisNumber: z.string().min(3, "Chassis number is required"),
        motorNumber: z.string().min(3, "Motor number is required"),
        batteryNumber: z.string().min(3, "Battery number is required"),
        chargerNumber: z.string().optional(),
        color: z.string().min(2, "Color is required"),
      })
    )
    .optional(),
});

export const PurchaseCreateSchema = z.object({
  supplier: z.string().min(1, "Supplier is required"),
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  invoiceDate: z.string().or(z.date()),
  lineItems: z.array(PurchaseLineItemSchema).min(1, "At least one item is required"),
  notes: z.string().optional(),
});

// Sales
export const SaleCreateSchema = z.object({
  saleDate: z.string().or(z.date()),
  customer: z.object({
    name: z.string().min(2, "Customer name is required"),
    phone: z.string().regex(/^[0-9]{10}$/, "Valid 10-digit phone required"),
    email: z.string().email().optional().or(z.literal("")),
    address: z.string().min(5, "Address is required"),
    idProofType: z.string().optional(),
    idProofNumber: z.string().optional(),
  }),
  vehicleId: z.string().min(1, "Vehicle selection is required"),
  dealerId: z.string().optional().nullable(),
  soldBy: z.string().min(1, "Salesperson (FEC) is required"),
  priceBreakdown: z.object({
    exShowroom: z.number().min(0),
    discount: z.number().min(0).default(0),
    gst: z.number().min(0),
    registration: z.number().min(0).default(0),
    insurance: z.number().min(0).default(0),
    accessories: z.number().min(0).default(0),
  }),
  paymentMode: z.enum(["CASH", "UPI", "BANK", "FINANCE"]),
  financierDetails: z
    .object({
      financierName: z.string(),
      loanAmount: z.number(),
      downPayment: z.number(),
      loanAccountNo: z.string().optional(),
    })
    .optional(),
  initialPayment: z
    .object({
      amount: z.number().min(0),
      reference: z.string().optional(),
    })
    .optional(),
});

export const SaleCancelSchema = z.object({
  reason: z.string().min(5, "Cancellation reason is required (min 5 characters)"),
});

// Incentive Scheme
export const SlabTierSchema = z.object({
  minUnits: z.number().int().min(1),
  maxUnits: z.number().int().nullable().optional(),
  amountPerUnit: z.number().min(0),
});

export const IncentiveRuleSchema = z.object({
  ruleType: z.enum(["PER_UNIT", "SLAB", "TARGET_BONUS", "PERCENTAGE", "TEAM_OVERRIDE"]),
  perUnitAmount: z.number().optional(),
  modelSpecificAmounts: z
    .array(
      z.object({
        model: z.string(),
        amount: z.number(),
      })
    )
    .optional(),
  slabs: z.array(SlabTierSchema).optional(),
  slabApplication: z.enum(["ALL_UNITS", "INCREMENTAL"]).default("ALL_UNITS"),
  targetUnits: z.number().optional(),
  targetRevenue: z.number().optional(),
  targetBonusAmount: z.number().optional(),
  percentageRate: z.number().optional(),
  teamOverridePerUnit: z.number().optional(),
  teamOverridePercentage: z.number().optional(),
});

export const IncentiveSchemeCreateSchema = z.object({
  name: z.string().min(3, "Scheme name is required"),
  description: z.string().optional(),
  validFrom: z.string().or(z.date()),
  validTo: z.string().or(z.date()),
  applicableRoles: z.array(z.enum(["FEC", "ASM", "BUSINESS_HEAD", "MANAGING_PARTNER", "ADMIN"])).min(1),
  applicableEmployees: z.array(z.string()).optional(),
  applicableModels: z.array(z.string()).optional(),
  applicableDealers: z.array(z.string()).optional(),
  rules: z.array(IncentiveRuleSchema).min(1, "At least one rule is required"),
});

// Payroll
export const PayrollRunCreateSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2035),
  notes: z.string().optional(),
});

export const PayrollAdjustSchema = z.object({
  entryId: z.string().min(1),
  workingDays: z.number().min(0).max(31).optional(),
  lopDays: z.number().min(0).max(31).optional(),
  adjustment: z
    .object({
      amount: z.number(), // in rupees in form
      reason: z.string().min(3, "Reason is required"),
    })
    .optional(),
  tds: z.number().min(0).optional(),
  advanceRecovery: z.number().min(0).optional(),
});

