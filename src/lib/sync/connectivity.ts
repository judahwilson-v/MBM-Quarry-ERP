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

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: "HEAD",
      signal: controller.signal,
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
      },
    });

    clearTimeout(timeout);
    return response.ok || response.status === 400; // 400 = reachable but no table specified
  } catch {
    return false;
  }
}
