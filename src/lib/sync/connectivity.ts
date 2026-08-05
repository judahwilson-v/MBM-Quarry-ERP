"use server";

/**
 * Check real network connectivity by pinging the Supabase REST endpoint.
 * navigator.onLine is unreliable in Electron (returns false on localhost),
 * so we do a lightweight server-side HEAD request instead.
 */
export async function checkOnlineStatus(): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    // No Supabase configured — treat as offline
    return false;
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${supabaseUrl}/rest/v1/global_settings?select=id&limit=1`, {
      method: "GET",
      signal: controller.signal,
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""}`,
      },
      cache: "no-store",
    });

    return response.ok;
  } catch {
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
