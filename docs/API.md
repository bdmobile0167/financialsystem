# API 介面文檔 (API.md)

> 記錄系統前端與 Supabase 後端的 API 介面定義、呼叫慣例與錯誤處理。

---

## 🔗 基礎設定

```javascript
// scripts/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'YOUR_SUPABASE_URL'
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
})
```

---

## 📋 API 呼叫慣例

### 統一錯誤處理模式
```javascript
const { data, error } = await supabase
  .from('table_name')
  .select('*')
  .eq('id', id)
  .single()

if (error) {
  console.error('API Error:', error.message)
  throw new Error(`查詢失敗: ${error.message}`)
}
return data
```

### 分頁查詢標準
```javascript
const { data, error, count } = await supabase
  .from('table_name')
  .select('*', { count: 'exact' })
  .range(page * pageSize, (page + 1) * pageSize - 1)
  .order('created_at', { ascending: false })
```

### 角色權限檢查（前端）
```javascript
// scripts/state.js 或 ui.js
const currentUser = state.currentUser
const isFinancialRole = ['accounting', 'admin', 'super_admin'].includes(currentUser?.role)
const isManager = currentUser?.role === 'manager'
```

---

## 🎫 Voucher API (src/modules/voucher/voucherApi.js)

### createVoucher(voucherData)
建立新報支單
```javascript
// 參數
{
  voucher_number: string,      // 單號（自動產生或手動）
  applicant_id: uuid,          // 申請人 ID
  department_id: uuid,         // 部門 ID
  voucher_type: 'expense' | 'advance' | 'reimbursement' | 'payment',
  total_amount: number,
  currency: 'TWD' | 'USD' | ...,
  exchange_rate: number,
  receipt_month: 'YYYY-MM',
  detail_lines: VoucherLine[], // 明細行陣列
  invoice_lines: InvoiceLine[], // 發票行陣列
  trip_start_date: date,
  trip_end_date: date,
  remark: string
}

// 回傳
{ id, voucher_number, status: 'draft', created_at, ... }
```

### updateVoucher(voucherId, updates)
統一更新 API（包含主檔、明細、發票、附件）
```javascript
// 參數
{
  // 主檔欄位
  receipt_month?: string,
  detail_lines?: VoucherLine[],
  invoice_lines?: InvoiceLine[],
  trip_start_date?: date,
  trip_end_date?: date,
  total_amount?: number,
  remark?: string,
  
  // 附件操作
  newAttachments?: File[],           // 新上傳附件
  deleteAttachmentIds?: uuid[]       // 要刪除的既有附件 ID
}

// 回傳
{ id, ...updatedFields, updated_at }
```

### deleteVoucher(voucherId)
刪除報支單（含關聯附件、明細、發票、工作流日誌）
```javascript
// 回傳
{ success: true, deletedId: voucherId }
```

### getVoucher(voucherId)
取得單一報支單完整資料
```javascript
// 回傳
{
  ...voucher,
  voucher_lines: [...],
  invoices: [...],
  voucher_attachments: [...],
  voucher_workflow_logs: [...]
}
```

### listVouchers(filters, pagination)
查詢報支單列表
```javascript
// 參數
filters: {
  status?: string[],
  applicant_id?: uuid,
  department_id?: uuid,
  date_from?: date,
  date_to?: date,
  voucher_type?: string
}
pagination: { page: number, pageSize: number }

// 回傳
{ data: Voucher[], count: number }
```

---

## 📎 附件 API (src/modules/voucher/attachments.js)

### uploadAttachment(voucherId, file, uploadedBy)
上傳附件到 Storage 並建立 DB 記錄
```javascript
// 回傳
{ id, file_name, file_url, file_path, file_size, created_at }
```

### deleteAttachment(attachmentId)
刪除附件（Storage + DB）
```javascript
// 回傳
{ success: true }
```

### getAttachments(voucherId)
取得報支單所有附件
```javascript
// 回傳
[{ id, file_name, file_url, file_type, file_size, uploaded_by, created_at }, ...]
```

---

## 📊 報表 API (scripts/reports.js)

### buildCashflowStatement(companyId, dateFrom, dateTo)
現金流量表
```javascript
// 回傳
{
  operating: { items: [{ account, amount }], total: number },
  investing: { items: [...], total: number },
  financing: { items: [...], total: number },
  net_change: number,
  beginning_cash: number,
  ending_cash: number
}
```

### buildBalanceSheet(companyId, asOfDate)
資產負債表
```javascript
// 回傳
{
  assets: { current: [...], non_current: [...], total: number },
  liabilities: { current: [...], non_current: [...], total: number },
  equity: { items: [...], total: number }
}
```

### buildIncomeStatement(companyId, dateFrom, dateTo)
綜合損益表
```javascript
// 回傳
{
  revenue: { items: [...], total: number },
  expenses: { items: [...], total: number },
  net_income: number
}
```

### buildEquityStatement(companyId, dateFrom, dateTo)
權益變動表
```javascript
// 回傳
{
  opening_balance: number,
  changes: [{ date, description, amount, balance }],
  closing_balance: number
}
```

---

## 👥 用戶/權限 API (src/modules/admin/adminApi.js)

### getProfiles(filters)
查詢用戶列表
```javascript
// 參數
filters: { role?: string, department_id?: uuid, is_active?: boolean }

// 回傳
Profile[]
```

### updateProfile(userId, updates)
更新用戶資料
```javascript
// 參數
updates: { full_name?: string, role?: string, department_id?: uuid, avatar_url?: string }

// 回傳
Profile
```

### getDepartments()
取得所有部門
```javascript
// 回傳
Department[]
```

### createDepartment(data)
建立部門
```javascript
// 參數
{ name: string, code: string, parent_id?: uuid, sort_order?: number }

// 回傳
Department
```

### getProjects(filters)
查詢專案列表
```javascript
// 參數
filters: { department_id?: uuid, status?: string, manager_id?: uuid }

// 回傳
Project[]
```

### createProject(data)
建立專案
```javascript
// 參數
{ project_code: string, project_name: string, department_id: uuid, manager_id: uuid, budget_total: number, start_date: date, end_date: date }

// 回傳
Project
```

### updateProjectMembers(projectId, members)
更新專案成員
```javascript
// 參數
members: [{ user_id: uuid, role: 'member' | 'lead' | 'viewer' }]

// 回傳
ProjectMember[]
```

---

## 🏦 銀行帳戶 API (src/modules/accounting/ 相關)

### getBankAccounts()
取得所有銀行帳戶
```javascript
// 回傳
BankAccount[]
```

### createBankAccount(data)
建立銀行帳戶
```javascript
// 參數
{ account_name, bank_name, branch_name, account_number, currency, account_type, opening_balance }

// 回傳
BankAccount
```

### getBankTransactions(bankAccountId, dateFrom, dateTo)
查詢銀行流水
```javascript
// 回傳
BankTransaction[]
```

### importBankStatement(bankAccountId, transactions)
匯入銀行對帳單
```javascript
// 參數
transactions: [{ transaction_date, description, withdrawal, deposit, balance, counterparty, reference_number }]

// 回傳
{ imported: number, skipped: number }
```

---

## 📝 日記帳 API (src/modules/accounting/journal.js)

### createJournalEntry(entryData)
建立會計分錄
```javascript
// 參數
{
  entry_date: date,
  description: string,
  reference_type: 'voucher' | 'manual' | 'adjustment' | 'closing',
  reference_id: uuid,
  lines: [{ account_id, description, debit_amount, credit_amount, project_id, department_id }]
}

// 回傳
{ id, entry_number, ... }
```

### getJournalEntries(filters, pagination)
查詢分錄列表
```javascript
// 參數
filters: { date_from, date_to, status, reference_type, reference_id }
pagination: { page, pageSize }

// 回傳
{ data: JournalEntry[], count: number }
```

### postJournalEntry(entryId)
過帳分錄
```javascript
// 回傳
{ success: true, posted_at: timestamp }
```

---

## 🔔 通知 API

### getNotifications(userId, unreadOnly)
取得用戶通知
```javascript
// 回傳
Notification[]
```

### markNotificationRead(notificationId)
標記已讀
```javascript
// 回傳
{ success: true }
```

### createNotification(data)
建立通知（系統內部呼叫）
```javascript
// 參數
{ user_id, title, message, type, reference_type, reference_id }

// 回傳
Notification
```

---

## ⚠️ 錯誤代碼對照表

| HTTP 狀態 | PostgREST 代碼 | 說明 | 處理建議 |
|-----------|----------------|------|----------|
| 200 | - | 成功 | - |
| 201 | - | 建立成功 | - |
| 400 | PGRST100 | 請求參數錯誤 | 檢查欄位型別、必填欄位 |
| 401 | PGRST301 | 未授權（JWT 過期） | 重新登入、刷新 token |
| 403 | PGRST301 | 權限不足（RLS 擋下） | 確認用戶角色、RLS policy |
| 404 | PGRST116 | 查無資料 | 使用 `.maybeSingle()` 避免拋錯 |
| 406 | PGRST116 | `.single()` 查回 0 筆 | 改用 `.maybeSingle()` |
| 409 | 23505 | 唯一鍵衝突 | 檢查重複單號、email 等 |
| 422 | PGRST204 | 檢查約束失敗 | 檢查 FK、CHECK 約束 |
| 500 | - | 伺服器錯誤 | 檢查 Supabase 狀態、聯繫支援 |

---

## 🔄 即時訂閱

```javascript
// 訂閱 Voucher 變更
const subscription = supabase
  .channel('vouchers_changes')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'vouchers',
    filter: `applicant_id=eq.${userId}`
  }, (payload) => {
    console.log('Voucher 變更:', payload)
    // 更新 UI 狀態
  })
  .subscribe()

// 取消訂閱
subscription.unsubscribe()
```

---

## 📦 批次操作

```javascript
// 批次插入
const { data, error } = await supabase
  .from('voucher_lines')
  .insert(lines.map(line => ({ ...line, voucher_id })))

// 批次更新
const { data, error } = await supabase
  .from('vouchers')
  .upsert(vouchers.map(v => ({ id: v.id, status: 'completed' })))
```

---

*最後更新：2026-08-11*
*版本：Demo v2.9.3*