import { DispatchPage } from "@/components/modules/dispatch-page";

export default function Page({ params }: { params: { slipId: string } }) {
  return <DispatchPage slipId={params.slipId} />;
}
