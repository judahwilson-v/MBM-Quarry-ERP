import type { Prisma } from "@prisma/client";

export async function incrementVehicleTrips(tx: Prisma.TransactionClient, vehicleId: string, tripDelta: number) {
  await tx.vehicle.update({
    where: { id: vehicleId },
    data: { tripCount: { increment: tripDelta } },
  });
}

export async function decrementVehicleTrips(tx: Prisma.TransactionClient, vehicleId: string, tripDelta: number) {
  await tx.vehicle.update({
    where: { id: vehicleId },
    data: { tripCount: { decrement: tripDelta } },
  });
}
