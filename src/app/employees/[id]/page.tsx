import { EmployeeLedgerPage } from "@/components/modules/employee-ledger-page";

export default function EmployeeLedgerRoute({ params }: { params: { id: string } }) {
  return <EmployeeLedgerPage id={params.id} />;
}
