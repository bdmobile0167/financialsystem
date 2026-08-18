# RLS 權限修正指南（給 Supabase 處理）

## 一、問題描述（請貼給 Supabase Support）

當 `employee`（一般專員）或 `manager`（部門主管）登入時，前端因無條件呼叫報表渲染，曾執行：
```
GET https://imlmclalgbfxhhnpsyam.supabase.co/rest/v1/accounts?select=id&code=eq.1102
```
回傳 **406 Not Acceptable**；`admin` / `accounting` 角色正常。

### 實際原因（兩層）
1. **設計權限**：依系統設計，**財報僅限 `accounting`（會計部門）與 `admin`（管理員）檢視**；`employee` / `manager` 不應看到財報，也不應能讀取財報所需的財務資料表（`accounts`、`journal_entries`、`bank_transactions` 等）。
2. **前端 Bug（已修正）**：舊版 `ui.js` 的 `render()` 會**無條件**呼叫 `renderReports()`，導致 employee/manager 登入即觸發財務表查詢，被 RLS 擋下後回傳 406；且 `reports.js` 使用 `.single()` 在查回 0 筆時回傳 406。

### 前端已修正（2026-08-03）
- `scripts/ui.js` `render()`：僅 `accounting` / `admin` 才呼叫 `renderReports()` 與 `renderEquityTab()`。
- `scripts/reports.js` `buildCashflowStatement()`：`.single()` → `.maybeSingle()`，查無資料時平滑降級為本地計算，不再拋 406。

因此，只要前端修正已上線，employee/manager **不會再觸發** 406。Supabase 端只需把 RLS 設定成符合設計權限（見下方 SQL）。

---

## 二、建議的 RLS 設計（角色權限矩陣）

> 角色：`employee` / `manager` / `accounting` / `admin`（皆屬 `authenticated`，依 `profiles.role` 區分）。

| 資料表 | employee / manager | accounting / admin | 說明 |
|---|---|---|---|
| `profiles` | 可讀（需要申請人/主管姓名） | 可讀 | 建議僅開放必要欄位或同部門 |
| `departments` | 可讀 | 可讀 | 下拉選單 |
| `projects` | 可讀（同部門） | 可讀（全部） | 依 `department_id` 過濾 |
| `user_projects` | 可讀（本人） | 可讀 | 專案指派 |
| `payees` | 可讀 | 可讀 | 報支時查付款人 |
| `vouchers` | 可讀（本人申請/待審/同部門） | 可讀（全部） | 依狀態/角色過濾 |
| `voucher_lines` / `invoices` / `voucher_attachments` | 可讀（關聯到有權限的 vouchers） | 可讀 | |
| `voucher_workflow_logs` | 可讀（關聯的 vouchers） | 可讀 | |
| `voucher_payments` | **不可讀** | 可讀 | 財務機密 |
| `notifications` | 可讀（本人 `user_id`） | 可讀（本人） | |
| `accounts` | **不可讀** | 可讀 | 會計科目為財務資料 |
| `journal_entries` | **不可讀** | 可讀 | 會計分錄 |
| `bank_accounts` | **不可讀** | 可讀 | 銀行帳戶 |
| `bank_transactions` | **不可讀** | 可讀 | 銀行流水 |
| `bank_statement_transactions` | **不可讀** | 可讀 | 對帳單 |
| `project_budget_items` / `project_budget_logs` | 可讀（同部門專案） | 可讀 | |
| `roles` / `permissions` / `role_permissions` | 視需求 | 視需求 | 通常僅 admin |

> ⚠️ 若你的 RLS 目前完全沒有 policy（只有 service_role 繞過），請依下方 SQL 建立。若你已是多租戶架構，請在 `USING` 加入 `company_id` 過濾條件。

---

## 三、SQL 範例（在 Supabase SQL Editor 執行）

以下 SQL 先**移除**可能存在的「全開」policy，再建立「依角色」的 policy。請視你的資料表欄位調整。

### 0. 前置：確認 `profiles` 有 `role` 欄位
你的 `public.profiles` 已有 `role` 欄位（`admin` / `accounting` / `manager` / `employee`），可直接使用。

### 1. `accounts`（會計科目）— 僅 accounting / admin
```sql
DROP POLICY IF EXISTS "accounts_select_all_authenticated" ON public.accounts;
DROP POLICY IF EXISTS "accounts_select_for_all_authenticated" ON public.accounts;

CREATE POLICY "accounts_select_financial_only" ON public.accounts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'accounting')
    )
  );
```

### 2. `journal_entries`（會計分錄）— 僅 accounting / admin
```sql
CREATE POLICY "journal_entries_select_financial_only" ON public.journal_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'accounting')
    )
  );
```

### 3. `bank_accounts`（銀行帳戶）— 僅 accounting / admin
```sql
CREATE POLICY "bank_accounts_select_financial_only" ON public.bank_accounts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'accounting')
    )
  );
```

### 4. `bank_transactions` / `bank_statement_transactions` — 僅 accounting / admin
```sql
CREATE POLICY "bank_transactions_select_financial_only" ON public.bank_transactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'accounting')
    )
  );

CREATE POLICY "bank_statement_transactions_select_financial_only" ON public.bank_statement_transactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'accounting')
    )
  );
```

### 5. `profiles`（使用者基本資料）— 所有已登入可讀（必要欄位）
> 若需更嚴格，可改為「同部門或全部」，視業務需求。
```sql
CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);
```

### 6. `departments` / `payees` — 所有已登入可讀
```sql
CREATE POLICY "departments_select_authenticated" ON public.departments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "payees_select_authenticated" ON public.payees
  FOR SELECT TO authenticated USING (true);
```

### 7. `vouchers` — employee/manager 只能看「本人申請 / 同部門 / 待其審核」，accounting/admin 全看
```sql
CREATE POLICY "vouchers_select_all" ON public.vouchers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'accounting')
    )
    OR applicant_id = auth.uid()
    OR current_manager_id = auth.uid()
    OR department_id = (
      SELECT department_id FROM public.profiles WHERE id = auth.uid()
    )
  );
```

> `voucher_lines` / `invoices` / `voucher_attachments` / `voucher_workflow_logs` 可用「EXISTS 其關聯 voucher 有權限」的方式建立，或視現況放寬。

### 8. `notifications` — 只能看自己的
```sql
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
```

### 9. `projects` — employee/manager 看同部門，accounting/admin 看全部
```sql
CREATE POLICY "projects_select" ON public.projects
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'accounting')
    )
    OR department_id = (
      SELECT department_id FROM public.profiles WHERE id = auth.uid()
    )
  );
```

---

## 四、驗證方式
1. 以 `accounting` / `admin` 登入 → 應可看到財報，DevTools Network 中 `accounts`、`journal_entries`、`bank_accounts` 回傳 200。
2. 以 `employee` / `manager` 登入 → **不應觸發**財務表查詢（前端已修正）；若手動直接打 `accounts` API 應回傳空陣列或 403/406（代表 RLS 正確擋下）。
3. 確認核銷流程仍正常：employee 可建立報支單、上傳附件、查詢自己的 vouchers / voucher_lines / payees / profiles。

---

## 五、補充：前端為何不再觸發 406
- `ui.js` `render()` 現在只在 `['accounting','admin']` 角色才呼叫 `renderReports()` 與 `renderEquityTab()`。
- `reports.js` `buildCashflowStatement()` 改用 `.maybeSingle()`，即使查無科目也只會降級為本地計算，不再拋 406。
- 若仍希望 employee/manager 完全無法讀取財務表，請務必執行上方第 1–4 項的「僅財務角色」policy。

---

*最後更新：2026-08-11*