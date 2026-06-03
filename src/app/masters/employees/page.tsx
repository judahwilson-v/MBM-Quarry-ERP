"use client";

import { MasterDataPage, commonFormatters } from "@/components/modules/master-data-page";

export default function EmployeesPage() {
  return (
    <MasterDataPage
      resource="employees"
      title="Employees"
      description="Worker master for pending book advances and deductions."
      fields={[
        { name: "name", label: "Employee name", required: true },
        { name: "role", label: "Role", required: true },
        { name: "baseSalary", label: "Base salary", type: "number" },
        { name: "phone", label: "Phone" },
        { name: "joinDate", label: "Join date" },
        { name: "isActive", label: "Active", type: "checkbox" },
      ]}
      columns={[
        { key: "name", label: "Employee" },
        { key: "role", label: "Role" },
        { key: "baseSalary", label: "Base Salary", format: commonFormatters.currency("baseSalary") },
        { key: "phone", label: "Phone" },
      ]}
    />
  );
}
