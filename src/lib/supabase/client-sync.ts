import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Dedicated client for background sync operations.
// Does NOT use Next.js cookies(), preventing the "cookies was called outside a request scope" error.
export function createSyncClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Use the secret key for sync if available (for bypass RLS), otherwise fallback to anon key.
  const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase environment variables are missing.');
  }

  return createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
    },
  });
}
