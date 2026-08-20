# Changelog

This is the single GitHub-facing changelog for the deployable frontend.

## Demo v2.9.12 - 2026-08-20

- Fixed sidebar visibility for department-bound users: transaction management, bank accounts, bank reconciliation, and budget management are hidden unless the user is accounting/admin or has the matching permission.
- Kept non-accounting/admin project data scoped to the user's department, so bound users only see their department/project amounts.
- Removed duplicate top-header welcome text; role/version metadata now displays separately.
- Repaired `uiHelpers.js` exports after legacy encoding damage so shared UI helpers load reliably.
- Prevented hidden finance/report/bank tabs from triggering unnecessary background data loads for users without permission.

## Demo v2.9.11 - 2026-08-20

- Fixed Dashboard Audit Trail oversized icons and the invalid search SVG path that caused console errors.
- Fixed project member loading by fetching `project_members` and `profiles` separately instead of relying on a missing Supabase FK relationship.
- Hardened invite-user API: verifies the server key is a real `service_role` key, rolls back Auth users when `profiles` insert fails, and keeps account creation from crashing when SMTP env is missing.
- Added frontend controls for editing user display names, toggling active status, and selecting permission flags.
- Improved department management table layout and permission option styling.
- Enforced accounting-only approve/close flow: accounting/admin must select a bank account, and vouchers without credentials are rejected before approval or payment close.
- Unified the older finance-center payment button through `closeVoucherByAccounting()` to avoid duplicate journal/bank write paths.
- Added voucher submit validation so approved vouchers cannot be created from rows marked with no invoice and no attachment.
- Fixed duplicate history buttons in voucher cards/workflow modules.
- Tightened report printing to only print the four financial report cards, with current-report and all-report modes.
- Enriched bank reconciliation rows with names and actual balances from `public.bank_account_balances` without replacing `journal_entries` as the accounting source.

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
