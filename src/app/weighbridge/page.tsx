import { getGlobalSettings } from "@/app/actions/settings";
import { getPendingTickets } from "@/app/actions/weighbridge";
import { redirect } from "next/navigation";
import { Scale } from "lucide-react";
import { PendingTicketsTable } from "./pending-tickets-table";
import { NewTicketDialog } from "./weighbridge-forms";

export const dynamic = "force-dynamic";

export default async function WeighbridgePage() {
  const settings = await getGlobalSettings();

  if (!settings.enableWeighbridge) {
    redirect("/");
  }

  const { tickets = [] } = await getPendingTickets();

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Scale className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Weighbridge Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Manage incoming and outgoing truck weights live.
          </p>
        </div>
        <div className="ml-auto flex items-center space-x-4">
          <NewTicketDialog />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Pending Trucks</h3>
            <Scale className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">{tickets.length}</div>
            <p className="text-xs text-muted-foreground">Awaiting second weight</p>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-bold tracking-tight mb-4">Pending Tickets</h2>
        <PendingTicketsTable tickets={tickets} />
      </div>
    </div>
  );
}
