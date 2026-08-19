---
schema_version: 2
type: reference
last_updated: "2026-08-18 23:55:00"
---

# Active AI Skills & Plugins

This reference details the explicit subset of Antigravity AI skills and plugins actively enabled for the MBM Quarry ERP project. 

> [!NOTE]
> To conserve context window bandwidth and avoid "hallucinated tool calls", unrelated plugins (e.g., `science`, `data-agent-kit-plugin`) have been globally disabled. The AI should rely **only** on the following enabled skills.

## Enabled & Expected Skills

### Web & Frontend
- **`modern-web-guidance-plugin`**: Principles and guidance for modern React, Next.js, and general web UI/UX.

### Database & Backend
- **`supabase`**: Official Supabase knowledge, auth, real-time, and client/server integrations.
- **`supabase-postgres-best-practices`**: Best practices for PostgreSQL schemas, RLS, and queries.
- **`supabase-server`**: Server-side specific Supabase SSR implementations.

### Mobile & App Platform
- **`android-cli-plugin`**: Commands and environment handling for Android development.
- **`flutter`**: Flutter cross-platform mobile/desktop SDK.
- **`firebase`**: Firebase SDK and infrastructure (used in legacy or complementary modules).

### APIs & DevTools
- **`chrome-devtools-plugin`**: Tooling for browser automation, DOM inspection, and debugging.
- **`google_maps_platform`**: Integration for maps, location routing, and geocoding APIs.
- **`gemini-api`**: Integration guidelines for using Gemini natively.

### Agent Capabilities
- **`agy-customizations`**: Internal rules for how this agent can customize its own behavior.
- **`antigravity-guide`**: System manual for the Antigravity CLI and environment.

## Policy
1. **Never** attempt to invoke or search for tools related to bioinformatics, ChEMBL, AlphaFold, or BigQuery/GCP data engineering.
2. If the AI detects a tool missing that belongs to the domains above, it should request user configuration updates rather than hallucinating commands.
