Demo v2.9.3 — Netlify frontend for 財務管理系統

Summary
- Version: Demo v2.9.3
- Purpose: Incremental multi-tenant migration and cleanup. This release replaces hard-coded, local company data with runtime Supabase-based queries and introduces UI version display.

Key Changes
- Multi-tenant foundations: prepared DB migrations and backfill scripts (see `netlify/db/migrations/`).
- Remote company data: frontend now fetches company info and structure settings from Supabase using `netlify/scripts/companyContext.js`.
- Removed reliance on local hard-coded company data: `netlify/scripts/company-data.js` compatibility exports are deprecated and set to empty.
- Header improvements: added dynamic company switcher for super_admin users and a visible version label `Demo v2.9.3` in the header.
- `state.js` no longer seeds structure settings from local files; it defaults to empty and expects remote settings.
- Reports and equity modules updated to read company opening capital from Supabase at runtime.

Developer Notes
- Important: Run DB migrations and backfill in staging before enabling RLS in production. See `netlify/db/RLS_APPLY_ROLLBACK.md` for guidance.
- Temporary: Supabase anon key was temporarily used during development; rotate and set proper runtime env vars before production.

How to run locally (quick)
1. Ensure you have a Supabase project and set the client URL and anon key in `netlify/scripts/supabaseClient.js` or environment-based loader.
2. Open `index.html` in a static server (e.g., `npx serve netlify`), or deploy to Netlify configured with the environment variables.

Files of interest
- `netlify/scripts/companyContext.js` — functions to fetch `companies` and `company_settings`.
- `netlify/scripts/ui.js` — UI init and header rendering (contains version label).
- `netlify/db/migrations/` — SQL migrations and RLS policy templates.

If you want, I can update `supabaseClient.js` to read from environment variables and remove any remaining hard-coded keys.
