import { createBrowserClient } from "@supabase/ssr";

// Uses NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY 
// from .env / .env.local

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-url.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

// The SSR browser client persists the auth session in cookies. Server Actions
// can then reuse the signed-in user for RLS-protected synchronization.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
