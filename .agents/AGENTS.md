# Agent Guidelines and Rules

## Supabase Schema Changes
ALWAYS REMEMBER: Any change to the Supabase database schema or any new queries that need to be run against Supabase must be explicitly communicated to the user.
- DO NOT assume Supabase migrations will happen automatically.
- YOU MUST put a clear **WARNING SIGN** (e.g., using GitHub alerts like `> [!WARNING]` or bold warnings) in your response telling the user exactly what new query or SQL needs to be run in their Supabase dashboard.
