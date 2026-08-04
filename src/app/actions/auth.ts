"use server";
import { getGlobalSettings } from "@/app/actions/settings";

export async function verifyEditPassword(input: string, type: "edit" | "delete" = "edit") {
  const settings = await getGlobalSettings();
  const target = type === "delete" ? settings.deletePin : settings.adminPin;
  return input.trim() === target;
}
