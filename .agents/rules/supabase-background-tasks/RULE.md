---
name: supabase-background-tasks
description: Rule for initializing Supabase clients in background tasks, cron jobs, or sync engines.
---

# Supabase Background Tasks Rule

When writing background tasks, sync engines, cron jobs, or any long-running server process that does not require the current user's session:
1. **DO NOT** use `@supabase/ssr` or `cookies()`. Calling `cookies()` outside of a strict Next.js Request Scope (like inside a background loop or detached promise) will crash the app with "cookies was called outside a request scope".
2. **DO USE** the standard `@supabase/supabase-js` client.
3. **Example**:
   ```typescript
   import { createClient } from '@supabase/supabase-js';
   
   export function createBackgroundClient() {
     return createClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.SUPABASE_SECRET_KEY! || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
       { auth: { persistSession: false } }
     );
   }
   ```
