import type { Role } from "@prisma/client";
import type { ComponentType } from "react";

export type PermissionModule =
  | "reports"
  | "sales.add"
  | "sales.mutate"
  | "masters"
  | "ledger"
  | "accounts"
  | "inventory"
  | "users"
  | "sync"
  | "audit";

const allRoles: Role[] = [
  "OWNER",
  "MANAGER",
  "ACCOUNTANT",
  "SUPERVISOR",
  "OPERATOR",
  "STORE_MANAGER",
];

export const permissionMatrix: Record<PermissionModule, Role[]> = {
  reports: ["OWNER", "MANAGER", "ACCOUNTANT"],
  "sales.add": [
    "OWNER",
    "MANAGER",
    "ACCOUNTANT",
    "SUPERVISOR",
    "OPERATOR",
  ],
  "sales.mutate": ["OWNER", "MANAGER", "ACCOUNTANT"],
  masters: ["OWNER", "MANAGER"],
  ledger: ["OWNER", "MANAGER", "ACCOUNTANT"],
  accounts: ["OWNER", "MANAGER", "ACCOUNTANT"],
  inventory: ["OWNER", "MANAGER", "SUPERVISOR", "STORE_MANAGER"],
  users: ["OWNER"],
  sync: allRoles,
  audit: ["OWNER", "MANAGER"],
};

export function checkPermission(role: Role | null | undefined, module: PermissionModule) {
  return Boolean(role && permissionMatrix[module]?.includes(role));
}

export function assertPermission(role: Role | null | undefined, module: PermissionModule) {
  if (!checkPermission(role, module)) {
    const error = new Error("You do not have permission to perform this action.");
    error.name = "PermissionError";
    throw error;
  }
}

export function withPermission<P extends { role?: Role | null }>(
  Component: ComponentType<P>,
  module: PermissionModule,
) {
  return function PermissionWrappedComponent(props: P) {
    if (!checkPermission(props.role, module)) {
      return null;
    }

    return <Component {...props} />;
  };
}
