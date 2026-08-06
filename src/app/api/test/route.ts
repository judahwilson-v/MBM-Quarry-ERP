import { listVehicles } from "@/app/actions/vehicles";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const data = await listVehicles();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 });
  }
}
