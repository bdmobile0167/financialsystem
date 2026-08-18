# Changelog

本文件記錄每個版本／Task 的主要變更。

---

## Demo v2.9.6 — 2026-08-18（修復：renderUserManagementView 重複宣告導致系統無法啟動）

### Summary of Changes
- **緊急修復**：`scripts/ui.js` 第 21 行從 `src/modules/userManagement/userManagement.js` 匯入 `renderUserManagementView`，
   但同一檔案第 133 行又重複宣告了同名函式，導致瀏覽器拋出 `SyntaxError: Identifier 'renderUserManagementView' has already been declared`，
   **整個系統完全無法啟動**。
- 移除 `scripts/ui.js` 頂層的匯入，保留檔案內已整合好的本地實作。
- 此為繼 BUG-004-002（`ROLE_LABELS` 重複宣告）之後，同一重構模式再次發生的遺留問題。

### Files Modified
- `scripts/ui.js`

### Root Cause 分類
- 屬於「共用函式抽出到獨立模組後，忘記同步移除原本本地宣告」的典型重構遺留問題。

---

## Demo v2.9.5 — 2026-08-18（修復：系統無法啟動的重複識別字錯誤）

### Summary of Changes
- **緊急修復**：`scripts/ui.js` 與抽出的共用模組 `src/modules/utils/uiHelpers.js` 存在 17 個重複的頂層識別字宣告
  （`ROLE_LABELS`、`showMessage`、`showToast`、`STATUS_LABELS`、`getStatusBadge` 等），
  導致瀏覽器拋出 `SyntaxError: Identifier 'ROLE_LABELS' has already been declared`，**整個系統完全無法啟動**。
- 移除全部重複的本地宣告，統一以 `uiHelpers.js` 匯出版本為唯一來源。
- 修正過程中發現並修正了關聯問題：兩個函式（`applyRoleBasedTabVisibility`／`updateAdminNavVisibility`）
  在抽出模組時被改寫為讀取 `window.state`，但 `state` 從未被指派到 `window.state`，
  已於 `ui.js` 補上 `window.state = state;`。
- 詳見 `docs/BUGS.md`（BUG-004-002）。

### Files Modified
- `scripts/ui.js`

### Root Cause 分類
- 屬於「共用函式抽出到獨立模組時，忘記同步移除原本本地宣告」的典型重構遺留問題，
  建議日後進行類似抽取重構時，抽取完成後立即以全域搜尋確認無殘留的重複宣告。

---

## Demo v2.9.4 — 2026-08-17（3/11 Plan Phase 3+4、RLS 收斂、資料表對齊修正）

### Summary of Changes
- **RLS 收斂（Task-003a 完成）**：重新盤點 Supabase RLS 現況後發現與 `RLS_GUIDE.md` 描述不同——`bank_accounts`、`journal_entries` 存在遺留的過寬 policy，讓 employee 也能讀到財務核心資料。已移除過寬 policy，`accounts` 則刻意維持開放（報支申請下拉選單需要全員可讀）。
- **合併交易/報支申請（Phase 3）**：確認 `transactions`、`vouchers` 兩表存在平行重複資料，移除「交易管理」頁籤中重複的新增表單，統一導向「報支申請」單一入口。
- **AI 輔助填報**：新增 `api/scan-receipt.js`（Gemini 2.5 Flash 視覺辨識），報支申請新增「AI 掃描憑證自動帶入」功能，可自動辨識憑證類型/金額/日期/費用類別並回填。
- **專案成員管理（Phase 4）**：修正 `profiles.permissions`、`project_members.role` 欄位與前端程式碼不一致的問題（資料庫先前缺少 `permissions` 欄位、`project_members` 欄位命名為 `role_in_project` 而非程式碼預期的 `role`）；`api/invite.js` 補上遺漏的 `permissions`/`employeeId` 接收邏輯；`updateProjectMembers()` 改為差異比對寫法，稽核紀錄更準確；`audit_logs` 補上遺漏的 SELECT policy；專案管理頁面新增成員編輯 Modal 與異動歷史顯示。
- 詳見 `docs/BUGS.md`（BUG-003-001 更新、BUG-004-001 新增）與 `docs/TASKS_COMPLETED.md`。

### Files Modified
- `index.html`、`scripts/ui.js`、`src/modules/admin/adminApi.js`、`api/invite.js`
- 新增：`api/scan-receipt.js`
- Supabase migrations：`tighten_financial_table_rls`、`add_permissions_and_fix_project_members`、`log_project_member_role_changes`、`audit_logs_select_policy`、`project_members_update_policy`

### Next Steps
- Task-003（Supabase Schema Cleanup）：清理 `adminApi.js` 中與實際使用版本（`budget.js`）重複、欄位命名不符的 `updateProjectBudget`/`fetchProjectBudgetLogs`。
- Phase 5／6（憑證勾稽核對強化、銀行帳戶管理優化）尚待規劃。

---

## Bugfix — 2026-08-03（employee 406 RLS 權限問題）

### Summary of Changes
- 診斷並記錄 `employee` 帳號登入後，報表查詢 `accounts?select=id&code=eq.1102` 回傳 **406 Not Acceptable** 的問題。
- 根因：`accounts` 資料表 RLS (Row Level Security) 未開放 `authenticated`（employee）角色的 SELECT policy，`buildCashflowStatement()` 使用 `.single()` 查回 0 筆 → PostgREST 回傳 406。
- 新增 `docs/RLS_FIX_guide.md`，內含提供給 Supabase 的完整 SQL policy 修正。
- 記錄於 `docs/BUGS.md`（BUG-003-001）。

### Files Modified
- `docs/RLS_GUIDE.md`（新增）
- `docs/BUGS.md`（新增 BUG-003-001 記錄）

### Next Steps（已於 2026-08-17 完成，見上方 Demo v2.9.4）
1. ~~在 Supabase SQL Editor 執行 `docs/RLS_GUIDE.md` 中的 SQL policy。~~ 實際執行時發現現況與文檔不同，改採對齊真實情況的修正方案。
2. ~~驗證 employee 登入後 `accounts?select=id&code=eq.1102` 不再 406。~~
3. 前端防呆（`.maybeSingle()` 與角色控制 `renderReports()`）已於前版完成。

---

## Demo v2.9.3 — 2026-08-03 (多租戶基礎)

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

---

## v2.9.3 (Task-002 完成) — Voucher 模組修復

### 新增
- `src/modules/voucher/voucherApi.js`：
  - `updateVoucher()` 統一更新 API，支援 `receipt_month`、`detailLines`、`invoiceLines`、`tripStartDate`、`tripEndDate`、`newAttachments`（上傳新附件）、`deleteAttachmentIds`（刪除既有附件）。
  - `createVoucher()`、`deleteVoucher()` 完成並與附件模組整合。
- `scripts/ui.js`：
  - 重送流程（`openResubmitModal` / `submitFullResubmission`）改為呼叫統一 `updateVoucher()` API。
  - 重送 Modal 顯示既有附件（`voucher_attachments`），並提供「勾選以移除」機制。

### 修正 (Bug)
- 重送時 workflow log 的 `from_status` 記錄錯誤：
  - 原因：在 `updateVoucher()` 已將狀態改為 `pending_review` 之後才讀取狀態，導致 `from_status` 誤記錄為 `pending_review`。
  - 修正：改為在 `updateVoucher()` **之前**讀取目前憑證狀態，`from_status` 使用更新前的真實狀態（如 `manager_rejected` / `accounting_rejected`），`to_status` 固定為 `pending_review`。
  - 詳見 `docs/BUGS.md`。

### 移除
- 移除不存在的欄位引用：`attachment_name`、`voucher_month`。
- 附件欄位統一使用 `voucher_attachments`。

### 文件
- 更新 `docs/TASKS_PENDING.md`、`docs/update.md`、`docs/BUGS.md`。

---

*最後更新：2026-08-17*
*版本：Demo v2.9.4*