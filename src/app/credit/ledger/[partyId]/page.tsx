import { LedgerPage } from "@/components/modules/credit-pages";

export default function Page({ params }: { params: { partyId: string } }) {
  return <LedgerPage partyId={params.partyId} />;
}
