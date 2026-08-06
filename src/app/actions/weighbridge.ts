"use server";

import { getDb } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  validateWithSchema,
  CreateWeighbridgeTicketSchema,
  CompleteWeighbridgeTicketSchema,
  VoidWeighbridgeTicketSchema,
} from "@/lib/validators/schemas";
import { sanitizeError } from "@/lib/utils/sanitize-error";

/**
 * Known Prisma error codes associated with concurrency collisions, DB locks, and transaction timeouts.
 */
const RETRIABLE_PRISMA_CODES = new Set(["P2002", "P2010", "P1008", "P2028"]);

/**
 * Classifies whether an error thrown during ticket creation is a retriable concurrency issue.
 */
function isRetriableConcurrencyError(error: any): boolean {
  if (!error) return false;

  if (typeof error.code === "string" && RETRIABLE_PRISMA_CODES.has(error.code)) {
    return true;
  }

  if (typeof error.message === "string") {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("ticket_number") ||
      msg.includes("database is locked") ||
      msg.includes("sqlite_busy") ||
      msg.includes("timed out") ||
      msg.includes("transaction expired") ||
      msg.includes("transaction api error")
    );
  }

  return false;
}

/**
 * Safely invokes Next.js revalidatePath without throwing if executed outside HTTP request context or during test execution.
 */
function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Ignore cache invalidation failures outside Next.js request lifecycle
  }
}

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
  let validatedData;
  try {
    validatedData = validateWithSchema(CreateWeighbridgeTicketSchema, data);
  } catch (error: any) {
    return { success: false, message: sanitizeError(error) };
  }

  const MAX_RETRIES = 5;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      const prisma = await getDb();

      const ticket = await prisma.$transaction(async (tx) => {
        // Calculate the next ticket number manually for SQLite atomically
        const maxTicket = await tx.weighbridgeTicket.aggregate({
          _max: { ticketNumber: true }
        });
        const nextTicketNumber = (maxTicket._max.ticketNumber || 0) + 1;

        return await tx.weighbridgeTicket.create({
          data: {
            ticketNumber: nextTicketNumber,
            vehicleNumber: validatedData.vehicleNumber,
            partyId: validatedData.partyId ?? undefined,
            materialId: validatedData.materialId ?? undefined,
            ticketType: (validatedData.ticketType as "INCOMING" | "OUTGOING") || "OUTGOING",
            status: "FIRST_WEIGHT",
            // If it's an OUTGOING sale, the first weight is the TARE (empty truck).
            // If it's an INCOMING boulder purchase, the first weight is the GROSS (loaded truck).
            ...(validatedData.ticketType === "INCOMING" 
                ? { grossWeight: validatedData.weight, grossTime: new Date() }
                : { tareWeight: validatedData.weight, tareTime: new Date() })
          }
        });
      });

      safeRevalidatePath("/weighbridge");
      return { success: true, ticket };
    } catch (error: any) {
      const isRetriable = isRetriableConcurrencyError(error);

      if (isRetriable && attempt < MAX_RETRIES) {
        const delay = 50 * attempt + Math.floor(Math.random() * 25);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (!isRetriable) {
        console.error("Non-retriable error creating weighbridge ticket:", error);
        return {
          success: false,
          message: sanitizeError(error, "Failed to create weighbridge ticket due to a system error. Please try again.")
        };
      }

      console.error(`Weighbridge ticket allocation failed after ${attempt} retry attempts:`, error);
      break;
    }
  }

  return {
    success: false,
    message: "Unable to allocate ticket number due to high concurrency. Please retry."
  };
}

/**
 * Completes a weighbridge ticket when the truck returns to the weighbridge.
 */
export async function completeWeighbridgeTicket(ticketId: string, finalWeight: number) {
  let validatedData;
  try {
    validatedData = validateWithSchema(CompleteWeighbridgeTicketSchema, { ticketId, finalWeight });
  } catch (error: any) {
    return { success: false, message: sanitizeError(error) };
  }

  try {
    const prisma = await getDb();
    
    const ticket = await prisma.weighbridgeTicket.findUnique({
      where: { id: validatedData.ticketId }
    });
    
    if (!ticket) return { success: false, message: "Ticket not found." };
    if (ticket.status !== "FIRST_WEIGHT") return { success: false, message: "Ticket is already completed or voided." };

    let updateData: any = { status: "SECOND_WEIGHT" };

    if (ticket.ticketType === "INCOMING") {
      // Incoming: first weight was gross, now we have tare (empty truck)
      const tareWeight = validatedData.finalWeight;
      const netWeight = (ticket.grossWeight || 0) - tareWeight;
      updateData = {
        ...updateData,
        tareWeight,
        tareTime: new Date(),
        netWeight: Math.max(0, netWeight) // Ensure non-negative
      };
    } else {
      // Outgoing: first weight was tare, now we have gross (loaded truck)
      const grossWeight = validatedData.finalWeight;
      const netWeight = grossWeight - (ticket.tareWeight || 0);
      updateData = {
        ...updateData,
        grossWeight,
        grossTime: new Date(),
        netWeight: Math.max(0, netWeight)
      };
    }

    const updatedTicket = await prisma.weighbridgeTicket.update({
      where: { id: validatedData.ticketId },
      data: updateData
    });

    safeRevalidatePath("/weighbridge");
    return { success: true, ticket: updatedTicket };
  } catch (error: any) {
    console.error("Error completing weighbridge ticket:", error);
    return {
      success: false,
      message: sanitizeError(error, "Failed to complete weighbridge ticket due to a system error. Please try again.")
    };
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
    return {
      success: false,
      message: "Failed to fetch pending tickets due to a system error. Please try again.",
      tickets: []
    };
  }
}

/**
 * Voids a ticket in case of an error.
 */
export async function voidWeighbridgeTicket(ticketId: string, remarks: string) {
  let validatedData;
  try {
    validatedData = validateWithSchema(VoidWeighbridgeTicketSchema, { ticketId, remarks });
  } catch (error: any) {
    return { success: false, message: sanitizeError(error) };
  }

  try {
    const prisma = await getDb();

    const ticket = await prisma.weighbridgeTicket.findUnique({
      where: { id: validatedData.ticketId }
    });

    if (!ticket) {
      return { success: false, message: "Ticket not found." };
    }

    if (ticket.status !== "FIRST_WEIGHT") {
      return { success: false, message: "Ticket is already completed or voided." };
    }

    await prisma.weighbridgeTicket.update({
      where: { id: validatedData.ticketId },
      data: { status: "VOID", remarks: validatedData.remarks }
    });
    safeRevalidatePath("/weighbridge");
    return { success: true };
  } catch (error: any) {
    console.error("Error voiding weighbridge ticket:", error);

    if (error?.code === "P2025") {
      return { success: false, message: "Ticket not found." };
    }

    return {
      success: false,
      message: sanitizeError(error, "Failed to void weighbridge ticket due to a system error. Please try again.")
    };
  }
}

