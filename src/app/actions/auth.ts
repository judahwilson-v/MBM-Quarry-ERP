"use server";
import { getGlobalSettings } from "@/app/actions/settings";

export async function verifyEditPassword(input: string, type: "edit" | "delete" = "edit") {
  if (!input || typeof input !== "string") return false;
  const settings = await getGlobalSettings();
  const defaultTarget = type === "delete" ? "7711" : "8888";
  const target = (type === "delete" ? settings?.deletePin : settings?.adminPin) || defaultTarget;
  return input.trim() === target.trim();
}
