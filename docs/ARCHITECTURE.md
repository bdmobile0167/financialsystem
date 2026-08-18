# 系統架構總覽 (ARCHITECTURE.md)

> 記錄財務管理系統的整體架構設計、技術棧、模組劃分與資料流向。

---

## 🏗️ 整體架構

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (Netlify)                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ index.html│  │  ui.js   │  │dashboard │  │ reports  │  ...   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       │             │             │             │               │
│       └─────────────┼─────────────┼─────────────┘               │
│                     ▼                                           │
│          ┌────────────────────┐                                 │
│          │  模組化 JS (ESM)   │                                 │
│          │  src/modules/      │                                 │
│          └─────────┬──────────┘                                 │
└────────────────────┼────────────────────────────────────────────┘
                     │ HTTPS / REST API
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                      後端 (Supabase)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ PostgreSQL  │  │   Auth      │  │  Storage    │             │
│  │  (資料庫)   │  │  (認證)     │  │  (檔案)     │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          ▼                                      │
│                 ┌─────────────────┐                             │
│                 │  RLS Policies   │  ← 核心權限控制             │
│                 └─────────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ 技術棧

| 層級 | 技術 | 版本/說明 |
|------|------|-----------|
| **前端框架** | 原生 JavaScript (ES Modules) | 無建置步驟，直接部署靜態檔案 |
| **部署平台** | Netlify | 靜態網站託管，支援環境變數 |
| **資料庫** | Supabase (PostgreSQL) | 含 RLS、Realtime、Auth、Storage |
| **認證** | Supabase Auth | Email/Password、OAuth、JWT |
| **檔案儲存** | Supabase Storage | Bucket: `voucher-attachments` |
| **樣式** | 原生 CSS + CSS Variables | `css/styles.css` |
| **圖表** | Chart.js | 報表視覺化 |

---

## 📦 模組架構 (src/modules/)

```
src/modules/
├── voucher/
│   ├── voucherApi.js      # Voucher CRUD 統一 API
│   └── attachments.js     # 附件上傳/下載/刪除
├── accounting/
│   ├── journal.js         # 日記帳分錄邏輯
│   ├── ledger.js          # 總分類帳
│   └── equity.js          # 權益變動表
├── admin/
│   └── adminApi.js        # 管理員 API（用戶、部門、專案等）
├── userManagement/
│   └── userManagement.js  # 用戶權限管理
├── utils/
│   └── uiHelpers.js       # UI 輔助函數
└── dashboard/
    └── dashboard.js       # 儀表板渲染邏輯
```

---

## 🔄 核心資料流向

### 1. Voucher 生命週期
```
建立 (createVoucher)
    │
    ├─► voucher_lines (明細)
    ├─► invoices (發票)
    └─► voucher_attachments (附件 → Storage)
    │
    ▼
送審 → 狀態: pending_review
    │
    ├─► 主管審核 → manager_approved / manager_rejected
    │
    ├─► 會計審核 → accounting_approved / accounting_rejected
    │
    ▼
完成 → 狀態: completed
    │
    ├─► 產生 journal_entries (會計分錄)
    ├─► 更新 ledger (總分類帳)
    └─► 更新 equity (權益變動)
```

### 2. 報表產生流程
```
使用者請求報表
    │
    ▼
reports.js (buildCashflowStatement, buildBalanceSheet, etc.)
    │
    ├─► 查詢 accounts (會計科目)
    ├─► 查詢 journal_entries (分錄)
    ├─► 查詢 bank_transactions (銀行流水)
    │
    ▼
計算與彙總
    │
    ▼
Chart.js 繪圖 / 表格顯示
```

### 3. 權限檢查流程
```
使用者登入 (Supabase Auth)
    │
    ▼
取得 JWT → 解析 role (profiles.role)
    │
    ▼
前端 ui.js render() 依角色決定渲染內容
    │
    ├─ employee/manager → 僅顯示核銷、專案、通知
    ├─ accounting/admin → 顯示財報、日記帳、銀行帳戶、權限管理
    └─ super_admin → 顯示公司切換器、所有功能
    │
    ▼
資料庫查詢 → RLS Policy 自動過濾
```

---

## 🗄️ 資料庫核心表關聯

```
profiles (使用者)
    │
    ├─► department_id → departments
    ├─► role (employee/manager/accounting/admin/super_admin)
    │
    ▼
vouchers (報支單主檔)
    │
    ├─► applicant_id → profiles
    ├─► current_manager_id → profiles
    ├─► department_id → departments
    │
    ├─► voucher_lines (明細行)
    │       └─► account_id → accounts (會計科目)
    │
    ├─► invoices (發票)
    ├─► voucher_attachments (附件)
    ├─► voucher_workflow_logs (審批歷程)
    └─► voucher_payments (付款紀錄)
```

---

## 🔐 RLS 權限模型

| 角色 | 核心權限 | 財務資料存取 |
|------|----------|--------------|
| `employee` | 建立/查看自己的 vouchers、專案、通知 | ❌ 無法讀取 accounts、journal_entries 等 |
| `manager` | 審核部門 vouchers、查看部門專案 | ❌ 無法讀取財務資料表 |
| `accounting` | 完整會計流程、財報、日記帳、銀行帳戶 | ✅ 可讀寫所有財務資料表 |
| `admin` | 系統管理、用戶管理、所有報表 | ✅ 可讀寫所有資料表 |
| `super_admin` | 多公司切換、系統設定 | ✅ 可跨公司存取 |

> 詳細 RLS Policy 定義請見 `RLS_GUIDE.md` 與 `DATABASE.md`

---

## 🌐 多租戶架構 (規劃中)

目前處於**遷移階段**，預計引入 `company_id` 欄位：

```
companies (公司)
    │
    ├─► company_memberships (用戶-公司關聯)
    │       ├─► user_id → profiles
    │       └─► role_in_company (admin/member 等)
    │
    ▼
所有業務表新增 company_id 欄位
    │
    ▼
RLS Policy 加入 company_id 過濾
    USING (company_id = current_user_company_id())
```

---

## 📁 關鍵檔案對照表

| 功能區域 | 核心檔案 | 說明 |
|----------|----------|------|
| **UI 入口** | `scripts/ui.js` | 初始化、路由、角色渲染控制 |
| **狀態管理** | `scripts/state.js` | 全域狀態、用戶資訊、公司設定 |
| **Supabase 客戶端** | `scripts/supabaseClient.js` | 建立 supabase 實例 |
| **公司上下文** | `scripts/companyContext.js` | 多公司資料獲取 |
| **Voucher API** | `src/modules/voucher/voucherApi.js` | 統一 CRUD、附件、工作流 |
| **報表引擎** | `scripts/reports.js` | 現金流量表、資產負債表等 |
| **儀表板** | `src/modules/dashboard/dashboard.js` | KPI 卡片、圖表、工作流指示器 |

---

## 🚀 部署流程

1. **開發**：修改 `test/netlify/` 下的檔案
2. **測試**：在 `test001/netlify/` 驗證新功能
3. **部署**：推送到 Netlify，自動建置部署
4. **環境變數**：在 Netlify Dashboard 設定 `SUPABASE_URL`、`SUPABASE_ANON_KEY`
5. **資料庫遷移**：在 Supabase SQL Editor 執行 migration SQL

---

*最後更新：2026-08-11*
*版本：Demo v2.9.3*