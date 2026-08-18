# 資料庫文件 (DATABASE.md)

> 本文件記錄系統使用的 Supabase 資料表結構、欄位定義與 RLS 權限概況。

---

## 📊 資料表總覽

系統前端 (`test/netlify`, `test001/netlify`, `表格自動化/netlify`) 目前使用到的資料表如下（以 `supabase.from('...')` 掃描結果為準）：

| 資料表 | 用途 | employee/manager | accounting/admin | 備註 |
|--------|------|------------------|------------------|------|
| `accounts` | 會計科目（如 1102 銀行存款） | **不可讀** | 可讀 | 財務資料，RLS 依 `profiles.role` |
| `bank_accounts` | 銀行帳戶 | **不可讀** | 可讀 | 財務資料 |
| `bank_transactions` | 銀行流水 | **不可讀** | 可讀 | 財務資料 |
| `bank_statement_transactions` | 對帳單匯入紀錄 | **不可讀** | 可讀 | 財務資料 |
| `departments` | 部門 | 可讀 | 可讀 | 選單資料 |
| `invoices` | 發票/收據 | 可讀（關聯 voucher 有權限時） | 可讀 | 依 voucher 權限 |
| `journal_entries` | 會計分錄 | **不可讀** | 可讀 | 財務資料 |
| `notifications` | 通知 | 可讀（本人） | 可讀（本人） | `user_id = auth.uid()` |
| `payees` | 付款人（身分證/統編） | 可讀 | 可讀 | 報支查詢用 |
| `profiles` | 使用者基本資料 | 可讀 | 可讀 | 需含 `role` 欄位做權限判斷 |
| `project_budget_items` | 專案預算分類 | 可讀（同部門專案） | 可讀 | |
| `project_budget_logs` | 專案預算變更紀錄 | 可讀（同部門專案） | 可讀 | |
| `projects` | 專案 | 可讀（同部門） | 可讀（全部） | 依 `department_id` |
| `user_projects` | 使用者-專案指派 | 可讀（本人） | 可讀 | |
| `voucher_attachments` | 報支單附件 | 可讀（關聯 voucher 有權限時） | 可讀 | 依 voucher 權限 |
| `voucher_lines` | 報支單明細 | 可讀（關聯 voucher 有權限時） | 可讀 | 依 voucher 權限 |
| `voucher_payments` | 報支單付款紀錄 | **不可讀** | 可讀 | 財務機密 |
| `voucher_workflow_logs` | 報支單審批歷程 | 可讀（關聯 voucher 有權限時） | 可讀 | 依 voucher 權限 |
| `vouchers` | 報支單主檔 | 可讀（本人/待審/同部門） | 可讀（全部） | |

> ⚠️ **權限設計**：財報僅限 `accounting`（會計部門）與 `admin`（管理員）檢視；`employee`/`manager` 不應讀取 `accounts`、`journal_entries`、`bank_accounts`、`bank_transactions` 等財務資料表。

---

## 🔑 核心資料表結構

### profiles (使用者基本資料)
```sql
id              uuid        PK, FK -> auth.users.id
email           text        信箱
full_name       text        姓名
role            text        'employee' | 'manager' | 'accounting' | 'admin' | 'super_admin'
department_id   uuid        FK -> departments.id
avatar_url      text        大頭照
created_at      timestamptz 預設 now()
updated_at      timestamptz 預設 now()
```

### departments (部門)
```sql
id          uuid        PK
name        text        部門名稱
code        text        部門代碼
parent_id   uuid        FK -> departments.id (自我關聯，支援階層)
sort_order  int         排序
created_at  timestamptz 預設 now()
```

### vouchers (報支單主檔)
```sql
id                    uuid        PK
voucher_number        text        單號 (唯一)
applicant_id          uuid        FK -> profiles.id (申請人)
department_id         uuid        FK -> departments.id
current_manager_id    uuid        FK -> profiles.id (目前審核主管)
status                text        'draft' | 'pending_review' | 'manager_approved' | 'manager_rejected' | 'accounting_approved' | 'accounting_rejected' | 'completed' | 'paid'
voucher_type          text        'expense' | 'advance' | 'reimbursement' | 'payment'
total_amount          numeric     總金額
currency              text        幣別 (預設 TWD)
exchange_rate         numeric     匯率 (預設 1)
receipt_month         text        歸屬月份 (YYYY-MM)
detail_lines          jsonb       明細行資料
invoice_lines         jsonb       發票行資料
trip_start_date       date        出差起日
trip_end_date         date        出差迄日
remark                text        備註
created_at            timestamptz 預設 now()
updated_at            timestamptz 預設 now()
```

### voucher_lines (報支單明細)
```sql
id              uuid        PK
voucher_id      uuid        FK -> vouchers.id
line_number     int         行號
account_id      uuid        FK -> accounts.id (會計科目)
description     text        摘要
debit_amount    numeric     借方金額
credit_amount   numeric     貸方金額
project_id      uuid        FK -> projects.id (專案)
department_id   uuid        FK -> departments.id
created_at      timestamptz 預設 now()
```

### invoices (發票/收據)
```sql
id                  uuid        PK
voucher_id          uuid        FK -> vouchers.id
invoice_number      text        發票號碼
invoice_date        date        發票日期
seller_name         text        賣方名稱
seller_tax_id       text        賣方統編
buyer_name          text        買方名稱
buyer_tax_id        text        買方統編
total_amount        numeric     總金額
tax_amount          numeric     稅額
invoice_type        text        'general' | 'special' | 'electronic' | 'receipt'
category            text        費用分類
verified            boolean     是否驗證
created_at          timestamptz 預設 now()
```

### voucher_attachments (附件)
```sql
id              uuid        PK
voucher_id      uuid        FK -> vouchers.id
file_name       text        檔案名稱
file_type       text        MIME type
file_url        text        公開讀取 URL
file_path       text        Storage 路徑
file_size       int         檔案大小
uploaded_by     uuid        FK -> profiles.id
created_at      timestamptz 預設 now()
```

### voucher_workflow_logs (審批歷程)
```sql
id              uuid        PK
voucher_id      uuid        FK -> vouchers.id
actor_id        uuid        FK -> profiles.id (操作人)
action          text        'submit' | 'approve' | 'reject' | 'resubmit' | 'pay' | 'cancel'
from_status     text        來源狀態
to_status       text        目標狀態
reject_reason   text        退件原因
created_at      timestamptz 預設 now()
```

### accounts (會計科目表)
```sql
id              uuid        PK
code            text        科目代碼 (如 1102, 2101, 4101)
name            text        科目名稱
parent_id       uuid        FK -> accounts.id (階層)
account_type    text        'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
level           int         階層層級
is_detail       boolean     是否明細科目 (可記帳)
normal_balance  text        'debit' | 'credit' (正常餘額方向)
created_at      timestamptz 預設 now()
```

### journal_entries (會計分錄)
```sql
id              uuid        PK
entry_number    text        分錄號碼
entry_date      date        分錄日期
description     text        摘要
reference_type  text        'voucher' | 'manual' | 'adjustment' | 'closing'
reference_id    uuid        參考單據 ID
total_debit     numeric     總借方
total_credit    numeric     總貸方
status          text        'draft' | 'posted' | 'reversed'
created_by      uuid        FK -> profiles.id
created_at      timestamptz 預設 now()
posted_at       timestamptz 過帳時間
```

### journal_entry_lines (分錄明細)
```sql
id              uuid        PK
entry_id        uuid        FK -> journal_entries.id
line_number     int         行號
account_id      uuid        FK -> accounts.id
description     text        摘要
debit_amount    numeric     借方金額
credit_amount   numeric     貸方金額
project_id      uuid        FK -> projects.id
department_id   uuid        FK -> departments.id
created_at      timestamptz 預設 now()
```

### bank_accounts (銀行帳戶)
```sql
id                  uuid        PK
account_name        text        帳戶名稱
bank_name           text        銀行名稱
branch_name         text        分行名稱
account_number      text        帳號
currency            text        幣別
account_type        text        'checking' | 'savings' | 'foreign_currency' | 'time_deposit'
opening_balance     numeric     期初餘額
current_balance     numeric     目前餘額 (計算欄位)
is_active           boolean     是否啟用
created_at          timestamptz 預設 now()
updated_at          timestamptz 預設 now()
```

### bank_transactions (銀行流水)
```sql
id                  uuid        PK
bank_account_id     uuid        FK -> bank_accounts.id
transaction_date    date        交易日期
description         text        摘要
withdrawal          numeric     提款
deposit             numeric     存款
balance             numeric     餘額
counterparty        text        往來單位
reference_number    text        參考號碼
category            text        分類
is_reconciled       boolean     是否已對帳
voucher_id          uuid        FK -> vouchers.id (關聯憑證)
created_at          timestamptz 預設 now()
```

### projects (專案)
```sql
id                  uuid        PK
project_code        text        專案代碼
project_name        text        專案名稱
department_id       uuid        FK -> departments.id
manager_id          uuid        FK -> profiles.id (專案主管)
budget_total        numeric     總預算
budget_used         numeric     已用預算 (計算欄位)
start_date          date        開始日期
end_date            date        結束日期
status              text        'planning' | 'active' | 'completed' | 'suspended'
created_at          timestamptz 預設 now()
updated_at          timestamptz 預設 now()
```

### project_members (專案成員)
```sql
id              uuid        PK
project_id      uuid        FK -> projects.id
user_id         uuid        FK -> profiles.id
role            text        'member' | 'lead' | 'viewer'
joined_at       timestamptz 預設 now()
```

### notifications (通知)
```sql
id              uuid        PK
user_id         uuid        FK -> profiles.id (接收者)
title           text        標題
message         text        內容
type            text        'info' | 'warning' | 'success' | 'error'
reference_type  text        'voucher' | 'project' | 'system' | 'approval'
reference_id    uuid        參考 ID
is_read         boolean     預設 false
created_at      timestamptz 預設 now()
```

---

## 🔐 RLS 權限摘要

詳細 RLS Policy 定義請見 `RLS_GUIDE.md`，核心原則：

| 資料表群組 | employee/manager | accounting/admin | 原則 |
|------------|------------------|------------------|------|
| 財務核心表 (`accounts`, `journal_entries`, `bank_accounts`, `bank_transactions`, `voucher_payments`) | ❌ 不可讀 | ✅ 可讀寫 | 財務機密，僅會計/管理員 |
| 基礎資料表 (`departments`, `payees`, `profiles`) | ✅ 可讀 | ✅ 可讀 | 業務運作所需 |
| 專案相關 (`projects`, `project_budget_items`, `project_budget_logs`, `user_projects`) | 同部門可讀 | 全部可讀 | 依 `department_id` 隔離 |
| Voucher 相關 (`vouchers`, `voucher_lines`, `invoices`, `voucher_attachments`, `voucher_workflow_logs`) | 本人/待審/同部門 | 全部可讀 | 依狀態與角色過濾 |
| 通知 (`notifications`) | 僅本人 | 僅本人 | `user_id = auth.uid()` |

> 若為多租戶架構（含 `company_id` 欄位），請在 policy 的 `USING` 條件中一併加上租戶過濾。

---

## ✅ 已修正的前端防呆（2026-08-03）

1. **`scripts/ui.js` `render()`**：僅 `['accounting','admin']` 角色才呼叫 `renderReports()` 與 `renderEquityTab()`，employee/manager 登入不再觸發財務表 DB 查詢 → 不再觸發 406。
2. **`scripts/reports.js` `buildCashflowStatement()`**：`.single()` → `.maybeSingle()`，即使查無科目也只降級為本地計算，不再因「0 筆」回傳 406。

---

## 🔍 驗證清單

- [ ] `accounting`/`admin` 登入 → 財報查詢回 200，報表正常
- [ ] `employee`/`manager` 登入 → 不再觸發財務表查詢；若手動直接打財務表 API 應被 RLS 擋下
- [ ] 核銷流程仍正常：employee 可建立報支單、上傳附件、查詢本人 vouchers / voucher_lines / payees / profiles

---

*最後更新：2026-08-11*
*版本：Demo v2.9.3*