# CHANGELOG

## Demo v2.9.3 — 2026-08-03

### Summary of Changes
- Introduced remote Supabase-backed company data fetching.
- Removed frontend reliance on local `company-data.js` constants (deprecated compatibility exports cleared).
- Preload company settings on UI init (`ui.js` now calls `companyContext.getCompanyInfo()` and `getStructureSettings()`).
- Header now shows a fixed version label `Demo v2.9.3` and a dynamic company switcher for `super_admin` users based on `company_memberships`.
- Updated reports and equity modules to fetch opening capital and company info from Supabase.
- Added `companyContext.js` as the central client helper for company-scoped queries.

### Rationale
This release is an incremental step toward full multi-tenant support: it centralizes company data in Supabase, reduces frontend hard-coding, and prepares the frontend to operate under DB-enforced tenant isolation (RLS to be applied after backfill).

### Notes
- Apply DB migrations and backfill in staging before enabling RLS.
- Remove any temporary hard-coded Supabase keys before production deployment.
