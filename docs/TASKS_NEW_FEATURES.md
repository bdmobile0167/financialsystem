# 新功能規劃 (TASKS_NEW_FEATURES.md)

> 記錄所有**新功能規劃**，來源自 `IMPLEMENTATION_PLAN.md`。優先順序由高到低。

---

## 🎯 開發優先順序總覽

| 優先順序 | 階段 | 主題 | 狀態 |
|----------|------|------|------|
| 1 | 階段 1 | 核心架構與權限系統 | ⏳ 待開始 |
| 2 | 階段 2 | Dashboard 重構 | ⏳ 待開始 |
| 3 | 階段 3 | 交易/報支申請合併與簽核流程 | ⏳ 待開始 |
| 4 | 階段 4 | 專案管理增強 | ⏳ 待開始 |
| 5 | 階段 5 | 憑證與勾稽核對 | ⏳ 待開始 |
| 6 | 階段 6 | 銀行帳戶優化 | ⏳ 待開始 |
| 6 | 階段 7 | 日記賬與總分類帳增強 | ⏳ 待開始 |
| 8 | 階段 8 | 文件更新 | ⏳ 待開始 |

---

## 階段 1：核心架構與權限系統

**目標**：建立完整的權限基礎設施，支援細粒度功能控制

| 任務 | 說明 | 參考 | 狀態 |
|------|------|------|------|
| 1.1 | 建立完整的 User 權限模型（參考 googleai 的 UserPermissions） | googleai | ⏳ |
| 1.2 | 修改 adminApi.js 支援細粒度權限控制 | googleai | ⏳ |
| 1.3 | 建立 UserManagementView 元件（參考 googleai） | googleai | ⏳ |
| 1.4 | 更新 index.html 加入權限管理頁面 | googleai | ⏳ |
| 1.5 | 更新 ui.js 整合權限檢查邏輯 | googleai | ⏳ |

### 權限模型設計重點
- **角色**：`employee` / `manager` / `accounting` / `admin` / `super_admin`
- **權限粒度**：功能級（如 `voucher:create`、`report:view`、`admin:user_manage`）
- **資料範圍**：本人 / 部門 / 公司 / 全部
- **儲存方式**：`roles`、`permissions`、`role_permissions` 三表設計

---

## 階段 2：Dashboard 重構

**目標**：參考 googleai 的卡片式儀表板，提供角色導向的視覺化概覽

| 任務 | 說明 | 參考 | 狀態 |
|------|------|------|------|
| 2.1 | 重寫 renderDashboard() 參考 googleai 的 DashboardView | googleai | ⏳ |
| 2.2 | 加入角色導向的指標卡片 | googleai | ⏳ |
| 2.3 | 加入工作流程步驟指示器 | googleai | ⏳ |
| 2.4 | 加入專案預算進度條 | googleai | ⏳ |
| 2.5 | 加入權限規範說明卡片 | googleai | ⏳ |

### Dashboard 設計重點
- **Employee**：我的待辦、我的報支單、專案進度、通知
- **Manager**：部門待審、部門預算、團隊負載、專案狀態
- **Accounting**：財報快照、待處理憑證、銀行餘額、對帳進度
- **Admin**：系統健康度、用戶統計、資料庫狀態、版本資訊

---

## 階段 3：交易/報支申請合併與簽核流程

**目標**：將 transactions 和 voucherWorkflow 合併為單一「單據管理」頁面，實作完整簽核流程

| 任務 | 說明 | 參考 | 狀態 |
|------|------|------|------|
| 3.1 | 合併 transactions 和 voucherWorkflow 為單一「單據管理」頁面 | googleai | ⏳ |
| 3.2 | 實作 BillSubmissionModal（參考 googleai） | googleai | ⏳ |
| 3.3 | 實作 BillApprovalView（參考 googleai 的多階段簽核） | googleai | ⏳ |
| 3.4 | 整合 AI 會計科目建議功能 | googleai | ⏳ |
| 3.5 | 加入發票/收據/領據類型支援 | googleai | ⏳ |
| 3.6 | 加入多幣別與匯率換算 | googleai | ⏳ |
| 3.7 | 加入代付/委託付款功能 | googleai | ⏳ |

### 簽核流程設計
```
建立單據 (draft)
    │
    ▼
送審 → pending_review
    │
    ├─► 主管審核 → manager_approved / manager_rejected
    │
    ├─► 會計審核 → accounting_approved / accounting_rejected
    │
    ▼
完成 → completed
    │
    ▼
付款 → paid
```

---

## 階段 4：專案管理增強

**目標**：專案成員可編輯、變更有記錄、預算池管理

| 任務 | 說明 | 參考 | 狀態 |
|------|------|------|------|
| 4.1 | 實作 ProjectManagementView（參考 googleai） | googleai | ⏳ |
| 4.2 | 加入專案成員編輯功能 | googleai | ⏳ |
| 4.3 | 加入專案變更歷史記錄 | googleai | ⏳ |
| 4.4 | 加入 OPEX 預算池說明 | googleai | ⏳ |
| 4.5 | 更新 budget.js 支援專案成員管理 | googleai | ⏳ |

### 專案管理重點
- **專案成員**：可新增/移除/變更角色，所有變更寫入 `project_budget_logs`
- **預算管理**：總預算、已用、可用、預警閾值
- **OPEX 預算池**：部門級預算池，專案從池中申請額度

---

## 階段 5：憑證與勾稽核對

**目標**：建立完整的憑證稽核與銀行對帳功能

| 任務 | 說明 | 參考 | 狀態 |
|------|------|------|------|
| 5.1 | 實作 VoucherAuditView（參考 googleai） | googleai | ⏳ |
| 5.2 | 實作 BankReconciliationView（參考 googleai） | googleai | ⏳ |
| 5.3 | 加入 Cross-Verification Audit 功能 | googleai | ⏳ |
| 5.4 | 整合銀行對帳單自動補錄憑證 | googleai | ⏳ |

### 核對功能重點
- **憑證稽核**：憑證完整性、借貸平衡、附件齊全、科目正確性
- **銀行對帳**：自動比對、手動配對、差異處理、未達帳項
- **交叉驗證**：憑證↔銀行流水↔發票 三方比對

---

## 階段 6：銀行帳戶優化

**目標**：多幣別、即時匯率、餘額自動計算、出納撥款

| 任務 | 說明 | 參考 | 狀態 |
|------|------|------|------|
| 6.1 | 實作 BankAccountManagementView（參考 googleai） | googleai | ⏳ |
| 6.2 | 加入多幣別支援與即時匯率換算 | googleai | ⏳ |
| 6.3 | 加入帳戶餘額自動計算 | googleai | ⏳ |
| 6.4 | 整合出納撥款選擇功能 | googleai | ⏳ |

### 銀行帳戶重點
- **多幣別**：TWD/USD/EUR/JPY/CNY 等，匯率自動更新（每日/手動）
- **餘額計算**：期初 + 存款 - 提款 = 期末，自動同步銀行流水
- **出納撥款**：付款時可選擇來源帳戶，自動扣減可用餘額

---

## 階段 7：日記賬與總分類帳增強

**目標**：完整的會計記帳功能、總分類帳查詢、IFRS 科目表

| 任務 | 說明 | 參考 | 狀態 |
|------|------|------|------|
| 7.1 | 實作 JournalLedgerView（參考 googleai） | googleai | ⏳ |
| 7.2 | 加入總分類帳查詢功能 | googleai | ⏳ |
| 7.3 | 加入 IFRS 科目表整合 | googleai | ⏳ |
| 7.4 | 優化 journal.js 計算邏輯 | googleai | ⏳ |

### 會計功能重點
- **日記帳**：分錄建立、過帳、沖銷、期末結轉
- **總分類帳**：科目餘額試算表、明細帳、期間比較
- **IFRS 科目表**：標準科目代碼、層級結構、正常餘額方向

---

## 階段 8：文件更新

**目標**：同步更新所有技術文檔

| 任務 | 說明 | 狀態 |
|------|------|------|
| 8.1 | 更新 DATABASE.md | ⏳ |
| 8.2 | 更新 API.md | ⏳ |
| 8.3 | 更新 CHANGELOG.md | ⏳ |
| 8.4 | 建立 TODO.md 追蹤剩餘工作 | ⏳ |
| 8.5 | 更新 README.md | ⏳ |

---

## 📊 資料庫對應表（新功能所需新增/修改的表）

| 資料表 | 用途 | 階段 |
|--------|------|------|
| `roles` | 角色定義 | 1 |
| `permissions` | 權限定義 | 1 |
| `role_permissions` | 角色權限對應 | 1 |
| `project_members` | 專案成員 | 4 |
| `project_budget_logs` | 專案預算異動記錄 | 4 |
| `audit_logs` | 稽核記錄 | 5 |
| `ifrs_adjustments` | IFRS 調整分錄 | 7 |
| `ifrs_adjustment_lines` | IFRS 調整分錄明細 | 7 |
| `financial_report_notes` | 財報附註 | 7 |
| `payees` | 受款人/廠商檔 | 3 |

> 現有表：`profiles`、`departments`、`projects`、`vouchers`、`voucher_lines`、`invoices`、`voucher_payments`、`voucher_workflow_logs`、`voucher_attachments`、`bank_accounts`、`bank_transactions`、`bank_statement_transactions`、`accounts`、`journal_entries`、`transactions`、`notifications`

---

## 🚀 里程碑規劃

| 里程碑 | 目標版本 | 預計完成 | 交付內容 |
|--------|----------|----------|----------|
| M1：權限系統就緒 | `0.3.0` | Phase-1 完成 | 細粒度權限、用戶管理頁面 |
| M2：Dashboard 上線 | `0.4.0` | Phase-2 完成 | 角色導向儀表板 |
| M3：單據管理合併 | `0.5.0` | Phase-3 完成 | 統一單據頁面、多階段簽核 |
| M4：專案管理增強 | `0.6.0` | Phase-4 完成 | 成員編輯、變更歷史、OPEX |
| M5：核對功能上線 | `0.7.0` | Phase-5 完成 | 憑證稽核、銀行對帳 |
| M6：銀行/日記帳完善 | `0.8.0` | Phase-6/7 完成 | 多幣別、總分類帳、IFRS |
| M7：Beta 版本 | `0.9.0` | Phase-8 完成 | 功能完整、文檔齊全、UAT 就緒 |
| **M8：正式版 1.0.0** | **`1.0.0`** | **UAT 通過** | **API 穩定、生產部署** |

---

*最後更新：2026-08-11*
*來源：`test001/netlify/docs/IMPLEMENTATION_PLAN.md`*