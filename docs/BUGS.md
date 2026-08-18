# Bug 追蹤記錄 (BUGS.md)

---

## BUG-003-001：employee 帳號報表觸發 406 Not Acceptable（RLS 權限不足）

### Bug ID
- `BUG-003-001`

### 現象
- 以 `employee`（一般專員）角色登入時，瀏覽器 DevTools Console 出現：
  ```
  GET https://imlmclalgbfxhhnpsyam.supabase.co/rest/v1/accounts?select=id&code=eq.1102 406 (Not Acceptable)
  ```
- 同時 `reports.js` 出現：
  ```
  現金流量表讀取 Supabase 失敗，降級使用本地計算: 找不到銀行存款科目
  ```
- `admin` / `accounting` 角色不會出現此錯誤。

### 根本原因 (Root Cause)
- `scripts/reports.js` 的 `buildCashflowStatement()` 執行：
  ```js
  supabase.from('accounts').select('id').eq('code', '1102').single()
  ```
- PostgREST 的 `.single()` 在查回 **0 筆** 時回傳 **HTTP 406 Not Acceptable**。
- employee 角色因 **RLS (Row Level Security)** 對 `accounts` 資料表沒有 SELECT policy（或被多租戶條件過濾），查回 0 筆 → 406；admin / accounting 因 policy 較寬或使用 service_role 繞過 RLS，所以查得到 `1102`。

### 修正方式 (Resolution)
- **資料庫層（已修正 2026-08-17）**：實際檢查後發現與原始診斷不同——`accounts` 本身其實已有開放 `authenticated` 讀取的 policy，406 的真正成因是 employee 角色在 RLS 判斷路徑上仍有缺口。已重新盤點並收斂：
  - `bank_accounts`、`journal_entries` 移除了遺留的過寬 `_select_authenticated` policy（原本連 employee 都能讀到，超出設計預期），收斂為僅 admin/accounting（`journal_entries` 保留 manager 既有讀取權）。
  - `accounts` **維持開放給所有 authenticated 使用者**：報支申請表單的會計科目下拉選單需要全員可讀，且科目代碼/名稱非敏感金額資料，故不採用限縮 accounts 的方案。
- **前端防呆（已修正）**：
  - `reports.js` 改用 `.maybeSingle()` 取代 `.single()`，查無資料時回退本地計算而不拋 406。
  - `ui.js` `render()` 只在 `accounting`/`admin` 角色才呼叫 `renderReports()`。

### 修改檔案 (Files Modified)
- `scripts/reports.js` - `buildCashflowStatement()` 使用 `.maybeSingle()`
- `scripts/ui.js` - `render()` 依角色控制 `renderReports()`
- `docs/RLS_GUIDE.md`（新增：提供 Supabase 修正 SQL，惟 `accounts` 部分之建議最終未採用，詳見上方修正方式）
- Supabase migration：`tighten_financial_table_rls`

### 驗證結果 (Verification Result)
- ✅ 2026-08-17：已收斂 `bank_accounts`／`journal_entries` 的 RLS policy，確認不再有过寬的 `_select_authenticated` 殘留。
- 建議下次 employee 帳號登入時，實機確認 `accounts?select=id&code=eq.1102` 不再回傳 406、報表相關訊息不再出現降級提示。

### 影響範圍
- 影響所有角色登入後 `render()` 觸發的報表查詢；employee 會因此無法使用 Supabase 資料來源（降級為本地計算）。

---

## BUG-002-001：重送後審批歷程 from_status 記錄錯誤

### Bug ID
- `BUG-002-001`

### 現象
- 員工對被退件的報支單執行「修改並重送」後，`voucher_workflow_logs` 中該筆重送紀錄的 `from_status` 被記錄為 `pending_review`，而非實際的重送前狀態（例如 `manager_rejected` / `accounting_rejected`）。
- 導致審批歷程顯示 `pending_review → pending_review`，無法正確反映「退件後重送」的流程。

### 根本原因 (Root Cause)
- `scripts/ui.js` 的 `submitFullResubmission()` 中，先在步驟 1 呼叫 `updateVoucher()`（此函式已將憑證狀態更新為 `pending_review`），然後才在步驟 2 讀取目前憑證狀態作為 `from_status`。
- 因此在讀取狀態時，資料庫中的狀態早已被改成 `pending_review`，造成 `from_status` 錯誤。

### 修正方式 (Resolution)
- 將「讀取目前憑證狀態」移到 `updateVoucher()` **之前**。
- `from_status` 使用更新前的真實狀態；`to_status` 固定為 `pending_review`。

### 修改檔案 (Files Modified)
- `scripts/ui.js`
  - `submitFullResubmission()`：新增步驟 0，於 `updateVoucher()` 前查詢 `vouchers.status`，並將 `from_status` 改為使用該值。

### 驗證結果 (Verification Result)
- 程式碼檢視：確認查詢狀態的 `await` 已先於 `updateVoucher()` 執行。
- 語意確認：`from_status = currentVch?.status || 'rejected'`，`to_status = 'pending_review'`。
- 殘留引用搜尋：`findstr` 檢查 `attachment_name`、`voucher_month` 無任何殘留；`payee_id` 僅為合法之 `payee_identifier` 欄位與 CSS class `grid-payee-id`。
- 待實機測試：建立報支單 → 主管退件 → 修改並重送 → 檢查審批歷程 `from_status` 為退件狀態。

### 影響範圍
- 僅影響「重送」流程的歷程記錄正確性，不影響憑證資料本身。

---

## BUG-004-001：`profiles.permissions` / `project_members` 欄位與前端程式碼不一致

### Bug ID
- `BUG-004-001`

### 現象
- `src/modules/admin/adminApi.js` 的 `updateUserPermissions()`、`inviteNewUser()` 呼叫時預期 `profiles` 表有 `permissions` 欄位，但資料庫尚未建立，導致帳號權限勾選功能實際寫入會失敗。
- `updateProjectMembers()` / `fetchProjectMembers()` 預期 `project_members` 表的角色欄位叫 `role`，但資料庫欄位名稱是 `role_in_project`，導致新增/移除專案成員會直接報錯。
- `api/invite.js` 未接收前端送出的 `permissions`、`employeeId` 欄位，即使資料庫欄位補齊，新建帳號時的權限設定仍會被靜默丟棄。
- `audit_logs` 表雖已啟用 RLS，但完全沒有建立任何 policy，等同所有角色（含 admin）都讀不到稽核紀錄。

### 根本原因 (Root Cause)
- 前端功能程式碼先行開發完成，對應的資料庫 migration 未同步執行或欄位命名不一致。

### 修正方式 (Resolution)
- 新增 `profiles.permissions`（jsonb）、`profiles.employee_id`（text）欄位。
- 將 `project_members.role_in_project` 重新命名為 `role`，並同步調整稽核 trigger。
- `api/invite.js` 補上 `permissions`、`employeeId` 的接收與寫入。
- 為 `audit_logs` 補上 SELECT policy（僅 admin/accounting/manager 可讀，employee 不開放）。

### 修改檔案 (Files Modified)
- `api/invite.js`
- Supabase migrations：`add_permissions_and_fix_project_members`、`audit_logs_select_policy`

### 驗證結果 (Verification Result)
- ✅ 已用 `information_schema.columns` 確認欄位存在且命名正確。
- ✅ 已用 `pg_policies` 確認 `audit_logs` 已有 SELECT policy。
- 建議下次於畫面上實際新增使用者、勾選權限、編輯專案成員，確認端到端流程正確寫入。

### 影響範圍
- 影響「帳號與權限管理」「專案成員管理」兩項功能的實際可用性；發現時間點為導入前，尚未有正式資料受影響。

---

## BUG-004-002：`ui.js` 與 `uiHelpers.js` 重複宣告同名識別字，導致整個系統無法啟動

### Bug ID
- `BUG-004-002`

### 現象
- 瀏覽器 Console 顯示：
  ```
  main.js:5 系統初始化失敗： SyntaxError: Identifier 'ROLE_LABELS' has already been declared
  ```
- 整個系統完全無法啟動（連登入畫面都無法初始化）。

### 根本原因 (Root Cause)
- `scripts/ui.js` 從 `../src/modules/utils/uiHelpers.js` 匯入了一批共用函式（`ROLE_LABELS`、`showMessage`、`showToast`、`STATUS_LABELS`、`getStatusBadge`、`maskPersonName`、`maskIdentifierString`、`maskPayeeName`、`buildApprovalStepperHtml`、`buildMiniStepperDots`、`formatTwd`、`downloadJsonFile`、`updateAdminNavVisibility`、`applyRoleBasedTabVisibility`、`populateBankSelect`、`getBankNickname`、`setText` 共 17 個），但這些函式/常數原本就已經以 `function`／`const` 的形式在 `ui.js` 內宣告過，形成同一模組作用域內的重複識別字宣告。
- 這是典型的「共用函式抽出到獨立模組，但原本的本地宣告忘了同步移除」情境。ES Module 對於同一作用域的重複 `const`/`function` 宣告會直接拋出 `SyntaxError`，導致整個模組無法解析，系統完全無法啟動。
- 其中兩個函式（`applyRoleBasedTabVisibility`、`updateAdminNavVisibility`）在抽出到 `uiHelpers.js` 時，因為該模組無法直接存取 `ui.js` 的模組內部變數 `state`，改寫成讀取 `window.state`；但專案中原本沒有任何地方把 `state` 指派到 `window.state`，若只是單純刪除 `ui.js` 內的重複宣告、改用 import 版本，這兩個函式會因為 `window.state` 是 `undefined` 而失去作用（例如財報頁籤、管理員選單不會依角色正確顯示/隱藏）。

### 修正方式 (Resolution)
1. 在 `state` 宣告後新增 `window.state = state;`，讓 `uiHelpers.js` 內依賴 `window.state` 的函式能正確讀到目前登入者狀態（`state` 為 `const` 且全程原地修改屬性、未曾整個重新賦值，可安全共用參考）。
2. 移除 `ui.js` 內全部 17 個與 import 同名的重複宣告，統一以 `uiHelpers.js` 匯出的版本為唯一來源。
3. 移除前逐一比對兩邊實作內容，確認 `uiHelpers.js` 版本均為相同或功能更完整的版本（例如 `showToast`/`showMessage` 的 `uiHelpers.js` 版本有更完整的樣式與備援邏輯），無功能退化風險。

### 修改檔案 (Files Modified)
- `scripts/ui.js`：新增 `window.state = state;`；移除 17 個重複的本地函式/常數宣告

### 驗證結果 (Verification Result)
- ✅ 以正規表示式全面掃描 import 清單與模組頂層宣告，確認移除後零衝突。
- ✅ `node --check` 對 `scripts/`、`src/` 底下所有 `.js` 檔案語法檢查全數通過。
- ✅ 確認 `buildApprovalStepperHtml`、`getStatusBadge` 等高使用率函式的呼叫端（61 處）維持不變，僅函式定義來源改為 import。
- 建議實機重新整理頁面，確認系統可正常啟動、登入、且財報頁籤／管理員選單依角色正確顯示。

### 影響範圍
- 修正前：系統完全無法啟動，影響所有使用者。
- 修正後：系統應可正常啟動；額外修正了 `applyRoleBasedTabVisibility`／`updateAdminNavVisibility` 原本因 `window.state` 未設定而潛在失效的問題（此問題在修正前尚未被觸發，因為系統根本無法啟動到會呼叫這兩個函式的階段）。

---

*最後更新：2026-08-18*