# Changelog

This is the single GitHub-facing changelog for the deployable frontend.

## Demo v2.9.10 - 2026-08-20

- Applied Supabase production migration `p0_rls_policy_hardening_v2`.
- Hardened `project_members` RLS policies: scoped to `authenticated`, removed `auth.role()` usage, and added update `WITH CHECK`.
- Split broad write policies on `bank_accounts`, `accounts`, and `project_budget_items` into explicit operation policies with insert/update checks.
- Added admin-only SELECT policies for `roles`, `permissions`, and `role_permissions`.
- Confirmed `bank_account_balances` is a `security_invoker=true` view and has authenticated SELECT grant.
- Updated the frontend version label to `Demo v2.9.10`.
- Updated `netlify/README.md` for GitHub/Vercel deployment documentation.
- Added local-only `local-test/` workspace and excluded it from Git with `.gitignore`.

## Demo v2.9.9 - 2026-08-20

- Banking current balances now read from `public.bank_account_balances`.
- Formal financial reports continue to use `journal_entries` / trial balance as the accounting source.
- Added bank reconciliation display for actual bank balance, ledger bank-account balance, and unreconciled difference.
- Fixed project member saving to re-fetch from Supabase after writes.
- Added invite-user rollback when Auth user creation succeeds but `profiles` insert fails.
- Added current-report and all-report print modes for financial reports.
- Added shared action locks to reduce duplicate write submissions.
- Removed confusing production login helper text and fixed menu toggle markup.
