/**
 * Central model registry.
 *
 * Mongoose only knows about a model once the file defining it has been
 * imported. Route handlers that `populate()` a ref (e.g. Sale -> Vehicle ->
 * VehicleModel) would otherwise fail with "Schema hasn't been registered"
 * depending on which routes happened to be loaded first. Importing this file
 * from connectToDatabase() guarantees every schema is registered.
 */
export * from "./AuditLog";
export * from "./Counter";
export * from "./Dealer";
export * from "./IncentiveLedger";
export * from "./IncentiveScheme";
export * from "./PayrollEntry";
export * from "./PayrollRun";
export * from "./Purchase";
export * from "./ReportingHistory";
export * from "./RolePermission";
export * from "./SalaryStructure";
export * from "./Sale";
export * from "./Setting";
export * from "./StockMovement";
export * from "./Supplier";
export * from "./User";
export * from "./Vehicle";
export * from "./VehicleModel";
export * from "./ChannelOrder";
export * from "./CreditLimitChange";
export * from "./DeliveryOrder";
export * from "./Distributor";
export * from "./FleetVehicle";
export * from "./LedgerEntry";
export * from "./StoredFile";
export * from "./Territory";
export * from "./Outlet";
export * from "./PartyDocument";
export * from "./SecurityDeposit";
export * from "./PartnerTarget";
export * from "./NetworkOrder";
export * from "./PartnerSale";
export * from "./StockTransfer";
export * from "./Hr";
