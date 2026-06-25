export type AppRole = "owner" | "manager" | "salesman";

export function canManageSales(role: AppRole) {
  return role === "owner" || role === "manager";
}

export function canViewReports(role: AppRole) {
  return role === "owner" || role === "manager";
}

export function canManageMasters(role: AppRole) {
  return role === "owner" || role === "manager";
}
