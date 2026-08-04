"use client";

import { useState } from "react";
import { WeighbridgeTicket } from "@prisma/client";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { CompleteTicketDialog } from "./weighbridge-forms";

interface PendingTicketsTableProps {
  tickets: WeighbridgeTicket[];
}

export function PendingTicketsTable({ tickets }: PendingTicketsTableProps) {
  const [selectedTicket, setSelectedTicket] = useState<WeighbridgeTicket | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleRowClick = (ticket: WeighbridgeTicket) => {
    setSelectedTicket(ticket);
    setDialogOpen(true);
  };

  if (tickets.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-muted-foreground bg-muted/20">
        <p>No trucks currently waiting inside the quarry.</p>
        <p className="text-sm mt-1">New incoming vehicles will appear here after their first weight.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="h-10 px-4 text-left font-medium">Ticket #</th>
              <th className="h-10 px-4 text-left font-medium">Vehicle</th>
              <th className="h-10 px-4 text-left font-medium">Type</th>
              <th className="h-10 px-4 text-left font-medium">First Weight</th>
              <th className="h-10 px-4 text-left font-medium">Time In</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => {
              const isIncoming = ticket.ticketType === "INCOMING";
              const weight = isIncoming ? ticket.grossWeight : ticket.tareWeight;
              const timeIn = isIncoming ? ticket.grossTime : ticket.tareTime;

              return (
                <tr 
                  key={ticket.id} 
                  className="border-b transition-colors hover:bg-muted/50 cursor-pointer"
                  onClick={() => handleRowClick(ticket)}
                >
                  <td className="p-4 font-medium">
                    WB-{ticket.ticketNumber}
                  </td>
                  <td className="p-4 font-bold">
                    {ticket.vehicleNumber}
                  </td>
                  <td className="p-4">
                    <Badge variant={isIncoming ? "default" : "secondary"}>
                      {isIncoming ? "INCOMING" : "OUTGOING"}
                    </Badge>
                  </td>
                  <td className="p-4 font-mono">
                    {weight?.toFixed(2)} {weight ? 'MT' : '-'}
                  </td>
                  <td className="p-4 text-muted-foreground">
                    {timeIn ? format(new Date(timeIn), "PP p") : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <CompleteTicketDialog 
        ticket={selectedTicket} 
        open={dialogOpen} 
        onOpenChange={setDialogOpen} 
      />
    </div>
  );
}
