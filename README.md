# Financial System Frontend

Version: `Demo v2.9.12`  
Internal version: `0.2.16`

This is the deployable frontend used by Vercel. The GitHub-facing app code and release notes live in this `netlify/` folder. The sibling `../docs/` folder is local project documentation and is not expected to be uploaded to GitHub.

## Latest Update

- Fixed role/permission sidebar visibility so transaction management, bank accounts, bank reconciliation, and budget management are only visible to accounting/admin users or users with the matching permission.
- Department-bound users continue to see only projects from their department in the project selector and dashboard project amounts.
- Removed duplicate welcome text from the top header; the header now shows one welcome line plus role/version metadata.
- Repaired shared UI helper exports so corrupted legacy strings cannot break module loading.
- Fixed production-facing Vercel issues: Audit Trail icon sizing/SVG path, project member profile loading without FK joins, invite-user rollback/error handling, single-report print scope, accounting-only close flow, and voucher credential validation.
- Accounting users/admins must select a bank account before approving/closing vouchers; vouchers without credentials must be rejected for completion.
- Admin user management now supports editing display names, status toggles, and permission choices from the frontend.
- Bank reconciliation rows include actual balances from `public.bank_account_balances` with bank account names when available.
- Banking current balances read from `public.bank_account_balances`.
- Formal financial reports still use `journal_entries` / trial balance as the accounting source.
- Bank reconciliation shows actual bank balance, ledger bank-account balance, and unreconciled difference.
- Project members can be added, removed, and saved per project with Supabase re-fetch after writes.
- Invite user flow rolls back the Auth user if `profiles` insert fails.
- Financial reports support printing the current report or all reports.
- Critical write actions use action locks to reduce duplicate submissions.
- Supabase migration `p0_rls_policy_hardening_v2` has been applied to project `imlmclalgbfxhhnpsyam`.

## Documentation

- Changelog: `CHANGELOG.md`
- Local-only project docs: `../docs/`

Only `netlify/CHANGELOG.md` should be maintained as the GitHub-facing changelog. Do not add a second deploy changelog under `docs/`.

## Local Development

Use any static server from the repository root or from this folder. Example:

```powershell
cd netlify
python -m http.server 8123
```

Then open:

```text
http://127.0.0.1:8123/
```

For isolated local login and smoke testing, use the ignored `local-test/` folder at the repository root. That folder is intentionally excluded from GitHub.

## Deployment Notes

- This project is pushed to GitHub and deployed by Vercel.
- Do not place Supabase `service_role` keys in frontend files.
- Keep runtime secrets in the deployment provider environment variables.
- After every production-facing change, update `CHANGELOG.md`, this README, and the local `../docs/` files when they are relevant.

## Supabase Notes

- Public Supabase project ref currently used by the frontend: `imlmclalgbfxhhnpsyam`.
- `bank_account_balances` is a `security_invoker=true` view.
- Remaining Supabase follow-up is tracked in `../docs/TASKS_PENDING.md`.
