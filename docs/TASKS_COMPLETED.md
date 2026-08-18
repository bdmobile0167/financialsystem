# 已完成任務 (TASKS_COMPLETED.md)

> 記錄所有**已完成**的任務，供歷史追蹤與知識傳承。

---

## 📦 版本號規範 (Semantic Versioning)

本專案採用 **語義化版本控制 (SemVer)**：`MAJOR.MINOR.PATCH`

| 版本號 | 代表意義 | 何時遞增 | 範例 |
|--------|----------|----------|------|
| **MAJOR** (x.0.0) | **重大不相容變更** | - 架構重大重構<br>- API 介面破壞性變更<br>- 資料庫 Schema 不相容變更<br>- **正式發布 1.0.0**（結束 Demo 階段） | `1.0.0` → `2.0.0` |
| **MINOR** (0.x.0) | **向下相容的新功能** | - 新增完整功能模組<br>- 新增 API 端點（不破壞舊功能）<br>- 新增資料表/欄位（不影響現有）<br>- 重要 UI/UX 改版 | `0.9.0` → `0.10.0` |
| **PATCH** (0.0.x) | **向下相容的修正** | - Bug 修復<br>- 文檔更新<br>- 程式碼重構（無功能變更）<br>- 效能優化<br>- 設定檔調整 | `0.9.3` → `0.9.4` |

### 🎯 目前版本策略

| 階段 | 版本號格式 | 說明 |
|------|------------|------|
| **Demo / 開發階段** | `Demo v0.x.x` | 尚未正式上線，功能不完整，可能有破壞性變更 |
| **Beta / 測試階段** | `Beta v0.x.x` | 功能完整，進行 UAT 測試 |
| **正式上線** | `v1.0.0` | **第一個穩定版本**，對外承諾 API 穩定 |
| **正式版後** | `v1.x.x` / `v2.x.x` | 依 SemVer 規範遞增 |

> **目前狀態**：`Demo v0.2.9`（內部顯示為 `Demo v2.9.3`，對應 `0.2.9`）
> - 待 Phase-1 所有核心功能完成並通過測試 → `Beta v0.9.0`
> - 待 UAT 通過、文檔完備、部署流程就緒 → **`v1.0.0` 正式版**

> 詳細版本規範請見 `VERSION.md`

---

## Task-002：Voucher 模組修復

**完成日期**：2026-08-03  
**狀態**：✅ 已完成  
**版本**：Demo v0.2.9 (顯示 `Demo v2.9.3`)

### 完成項目
- [x] 分析現有 Voucher 相關程式碼
- [x] 移除 `attachment_name`（不存在的欄位）
- [x] 統一使用 `voucher_attachments`
- [x] 修正新增憑證 API（`createVoucher`）
- [x] 新增修改憑證 API（`updateVoucher`）
- [x] 新增刪除憑證流程（`deleteVoucher`）
- [x] 修正附件上傳流程（`saveAttachment` 簽名相容）
- [x] 新增附件刪除流程（`deleteAttachment`）
- [x] 修正重送 workflow log `from_status` 記錄錯誤
- [x] 更新 `CHANGELOG.md`
- [x] 更新 `update.md`
- [x] 更新 `BUGS.md`（BUG-002-001）

### 關鍵修正
1. **統一 Voucher API**：`updateVoucher()` 一次完成主檔更新、明細替換、發票替換、附件上傳與既有附件刪除
2. **重送流程優化**：Modal 顯示既有附件，可勾選移除；送出呼叫統一 `updateVoucher()`
3. **Workflow Log Bug 修正**：`from_status` 現在在 `updateVoucher()` **之前**讀取，正確記錄退件狀態

### 修改檔案
- `src/modules/voucher/voucherApi.js`
- `src/modules/voucher/attachments.js`
- `scripts/ui.js`（`openResubmitModal`、`submitFullResubmission`）

---

## Task-003a：Employee 406 RLS 權限問題（診斷階段）

**完成日期**：2026-08-03  
**狀態**：✅ 診斷完成  
**版本**：Demo v0.2.9 (顯示 `Demo v2.9.3`)

### 完成項目
- [x] 診斷 employee 帳號 406 錯誤（RLS SELECT policy 不足）
- [x] 產出 `RLS_GUIDE.md`（Supabase 修正 SQL）
- [x] 更新 `BUGS.md`（BUG-003-001）
- [x] 更新 `CHANGELOG.md`、`update.md`
- [x] 前端防呆修正：
  - `reports.js` `buildCashflowStatement()`：`.single()` → `.maybeSingle()`
  - `ui.js` `render()`：僅 `accounting`/`admin` 才呼叫 `renderReports()`

### 根因分析
- **設計權限**：財報僅限 `accounting`/`admin` 檢視，employee/manager 不應讀取財務表
- **前端 Bug**：舊版 `ui.js` 無條件呼叫 `renderReports()`，導致 employee 觸發查詢被 RLS 擋下
- **PostgREST 行為**：`.single()` 查回 0 筆回傳 406

### 修改檔案
- `scripts/reports.js`
- `scripts/ui.js`
- `docs/RLS_GUIDE.md`（新增）

### 後續動作（Task-003a 執行階段）
- 待 Supabase 執行 `RLS_GUIDE.md` 中的 SQL policy
- 驗證 employee 登入不再觸發 406

---

## Demo v0.2.8 — 多租戶基礎遷移

**完成日期**：2026-08-01  
**狀態**：✅ 已部署  
**版本**：Demo v0.2.8

### 主要變更
- 引入遠端 Supabase-backed 公司資料獲取
- 移除前端對本地 `company-data.js` 常數的依賴
- UI 初始化預載公司設定（`companyContext.getCompanyInfo()`、`getStructureSettings()`）
- Header 顯示版本標籤與 `super_admin` 公司切換器
- 報表與權益模組改為從 Supabase 讀取期初資本與公司資訊
- 新增 `companyContext.js` 作為公司作用域查詢的核心客戶端輔助

---

## Task-003a：Employee 406 RLS 權限問題（執行階段）

**完成日期**：2026-08-17  
**狀態**：✅ 已完成  
**版本**：Demo v0.2.9 (顯示 `Demo v2.9.3`)

### 完成項目
- [x] 檢查現況才發現與文檔描述相反：`bank_accounts`、`journal_entries` 上存在遺留的
      `_select_authenticated` / `authenticated read` 寬鬆 policy（`qual: true`），
      讓 employee 也能讀到，而非文檔所述的「尚未建立限制」
- [x] 移除 `bank_accounts_select_authenticated`、`bank accounts authenticated read`、
      `journal_entries_select_authenticated` 三個過寬 policy
- [x] `journal_entries` 保留既有的 `journal entries role read`（admin/accounting/manager），
      `bank_accounts` 收斂為僅 `bank_accounts_write`（admin/accounting，ALL 涵蓋 SELECT）
- [x] **刻意不採用** `RLS_GUIDE.md` 對 `accounts` 的限制建議：確認報支申請表單的
      「會計科目」下拉選單需要所有員工讀取 `accounts`，且科目代碼/名稱本身非敏感金額資料，
      強制限制會讓一般員工無法送出報支申請

### 根因修正
- 原文檔判斷「尚未執行 RLS policy」，但實際是「已有 policy，只是設計錯誤過寬」
- 屬於認知落差：Supabase 現況與 `RLS_GUIDE.md`/`BUGS.md` 描述不一致，本次已對齊

### 修改內容
- Supabase migration：`tighten_financial_table_rls`

---

## 3/11 Plan Phase 3＋4：合併交易/報支申請、專案成員管理與稽核

**完成日期**：2026-08-17  
**狀態**：✅ 已完成  
**版本**：Demo v0.2.9 (顯示 `Demo v2.9.3`)

### Phase 3：合併交易/報支申請 + AI 輔助填報
- [x] 確認 `transactions` 與 `vouchers` 兩張表存在平行重複資料（各 4 筆測試資料），證實合併必要性
- [x] 移除「交易管理」頁籤中重複的「新增交易」表單（`transactionForm`），改為唯讀總帳 + 導引按鈕
- [x] 所有新增交易一律導向「報支申請」單一入口，避免繞過簽核流程產生分錄不一致
- [x] 新增 `api/scan-receipt.js`：以 Gemini 2.5 Flash 視覺模型辨識憑證圖片，
      自動判斷憑證類型（發票/收據/領據）、金額、日期、費用類別，並回填至報支申請的新增列
- [x] 報支申請表單新增「🤖 AI 掃描憑證自動帶入」上傳按鈕，串接辨識結果自動新增列並帶入欄位

### Phase 4：專案成員管理 + 稽核日誌
- [x] 修正 `profiles.permissions` / `project_members.role` 欄位與前端 `adminApi.js` 實際呼叫不一致的問題
      （資料庫原本沒有 `permissions` 欄位、`project_members` 欄位名稱是 `role_in_project` 而非 `role`）
- [x] 修正 `api/invite.js` 未接收/寫入 `permissions`、`employeeId` 的缺漏
- [x] 重寫 `updateProjectMembers()`：改為「差異比對」而非整批刪除重建，
      稽核紀錄只反映真正異動（新增/移除/角色變更），不會誤植未變更成員為「移除又新增」
- [x] 新增資料庫 trigger：`project_members` 新增/移除/角色變更自動寫入 `audit_logs`
- [x] 發現 `audit_logs` 雖啟用 RLS 但完全沒有 SELECT policy（等同連 admin 都讀不到），已補上
- [x] 專案管理頁面新增「編輯成員」Modal：可新增/移除成員、設定角色（負責人/一般成員），
      並顯示該專案的完整成員異動歷史紀錄

### 修改檔案
- `index.html`（交易管理頁籤改版、專案成員 Modal）
- `scripts/ui.js`（AI 掃描邏輯、專案成員管理邏輯）
- `src/modules/admin/adminApi.js`（`updateProjectMembers` 差異比對重寫）
- `api/invite.js`（補上 `permissions`/`employeeId`）
- `api/scan-receipt.js`（新增）
- Supabase migrations：`permissions_and_project_members`（後續修正為 `add_permissions_and_fix_project_members`）、
  `log_project_member_role_changes`、`audit_logs_select_policy`、`project_members_update_policy`

---

*最後更新：2026-08-17*
*目前版本：`0.2.9` (顯示：`Demo v2.9.3`)*