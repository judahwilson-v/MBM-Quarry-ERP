"use server";

import { getDb } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

/**
 * Creates a new weighbridge ticket.
 * Typically happens when a truck enters the quarry and sits on the weighbridge.
 */
export async function createWeighbridgeTicket(data: {
  vehicleNumber: string;
  partyId?: string;
  materialId?: string;
  ticketType?: "INCOMING" | "OUTGOING";
  weight: number;
}) {
  try {
    const prisma = await getDb();
    
    // Calculate the next ticket number manually for SQLite
    const maxTicket = await prisma.weighbridgeTicket.aggregate({
      _max: { ticketNumber: true }
    });
    const nextTicketNumber = (maxTicket._max.ticketNumber || 0) + 1;

    const ticket = await prisma.weighbridgeTicket.create({
      data: {
        ticketNumber: nextTicketNumber,
        vehicleNumber: data.vehicleNumber,
        partyId: data.partyId,
        materialId: data.materialId,
        ticketType: data.ticketType || "OUTGOING",
        status: "FIRST_WEIGHT",
        // If it's an OUTGOING sale, the first weight is the TARE (empty truck).
        // If it's an INCOMING boulder purchase, the first weight is the GROSS (loaded truck).
        ...(data.ticketType === "INCOMING" 
            ? { grossWeight: data.weight, grossTime: new Date() }
            : { tareWeight: data.weight, tareTime: new Date() })
      }
    });

    revalidatePath("/weighbridge");
    return { success: true, ticket };
  } catch (error: any) {
    console.error("Error creating weighbridge ticket:", error);
    return { success: false, message: error.message };
  }
}

/**
 * Completes a weighbridge ticket when the truck returns to the weighbridge.
 */
export async function completeWeighbridgeTicket(ticketId: string, finalWeight: number) {
  try {
    const prisma = await getDb();
    
    const ticket = await prisma.weighbridgeTicket.findUnique({
      where: { id: ticketId }
    });
    
    if (!ticket) throw new Error("Ticket not found.");
    if (ticket.status !== "FIRST_WEIGHT") throw new Error("Ticket is already completed or voided.");

    let updateData: any = { status: "SECOND_WEIGHT" };

    if (ticket.ticketType === "INCOMING") {
      // Incoming: first weight was gross, now we have tare (empty truck)
      const tareWeight = finalWeight;
      const netWeight = (ticket.grossWeight || 0) - tareWeight;
      updateData = {
        ...updateData,
        tareWeight,
        tareTime: new Date(),
        netWeight: Math.max(0, netWeight) // Ensure non-negative
      };
    } else {
      // Outgoing: first weight was tare, now we have gross (loaded truck)
      const grossWeight = finalWeight;
      const netWeight = grossWeight - (ticket.tareWeight || 0);
      updateData = {
        ...updateData,
        grossWeight,
        grossTime: new Date(),
        netWeight: Math.max(0, netWeight)
      };
    }

    const updatedTicket = await prisma.weighbridgeTicket.update({
      where: { id: ticketId },
      data: updateData
    });

    revalidatePath("/weighbridge");
    return { success: true, ticket: updatedTicket };
  } catch (error: any) {
    console.error("Error completing weighbridge ticket:", error);
    return { success: false, message: error.message };
  }
}

/**
 * Fetches all pending tickets (vehicles currently inside the quarry).
 */
export async function getPendingTickets() {
  try {
    const prisma = await getDb();
    const tickets = await prisma.weighbridgeTicket.findMany({
      where: { status: "FIRST_WEIGHT" },
      orderBy: { createdAt: 'desc' }
    });
    return { success: true, tickets };
  } catch (error: any) {
    console.error("Error fetching pending tickets:", error);
    return { success: false, message: error.message, tickets: [] };
  }
}

/**
 * Voids a ticket in case of an error.
 */
export async function voidWeighbridgeTicket(ticketId: string, remarks: string) {
  try {
    const prisma = await getDb();
    await prisma.weighbridgeTicket.update({
      where: { id: ticketId },
      data: { status: "VOID", remarks }
    });
    revalidatePath("/weighbridge");
    return { success: true };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}
