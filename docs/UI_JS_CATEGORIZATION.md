# ui.js 功能分類文檔

> 將 `test001/netlify/scripts/ui.js` (5664 行) 按功能模組分類，方便後續維護與模組化拆分。

---

## 📊 總覽統計

| 分類 | 行數範圍 | 核心功能 | 建議拆分優先級 |
|------|----------|----------|----------------|
| **1. 初始化與狀態管理** | 1-100 | 導入、initPage、state 定義 | 高 (已模組化) |
| **2. 使用者/權限管理** | 129-628 | Admin 用戶 CRUD、權限切換、密碼重設 | 高 (已模組化到 userManagement.js) |
| **3. 通用 UI 工具函數** | 630-889 | Toast、遮罩、銀行選單、狀態標籤、導航顯示 | 中 (可拆分到 uiHelpers.js) |
| **4. 核心渲染入口** | 869-909 | render() 主流程、角色標籤控制 | 高 |
| **5. 公司/業務資料** | 911-974 | 公司資訊、營業項目、董監名單表單 | 低 |
| **6. Dashboard 儀表板** | 977-1500+ | KPI 卡片、待審清單、專案預算、權限說明 | 高 (已模組化到 dashboard.js) |
| **7. 交易/銀行帳戶管理** | ~1500-2500 | 交易 CRUD、銀行帳戶、附件上傳 | 中 |
| **8. 報支單/簽核流程** | ~2500-3500 | Voucher 表單、審核 Modal、重送、歷程 | 高 (Phase 3 重點) |
| **9. 專案/預算管理** | ~3500-4000 | 專案 CRUD、預算異動、成員管理 | 中 (Phase 4 重點) |
| **10. 財務報表** | ~4000-4800 | 四大報表、試算表、募資模擬、IFRS 準則 | 中 |
| **11. 日記帳/憑證中心** | ~4800-5200 | 分錄列表、搜尋、憑證彙總 | 中 |
| **12. Audit Trail/稽核軌跡** | ~5200-5400 | 工作流日誌查詢、過濾 | 低 |
| **13. 事件綁定/初始化** | ~5400-5664 | initializeEvents、DOMContentLoaded、表單提交 | 高 |

---

## 🔍 詳細分類對照表

### 1. 初始化與狀態管理 (Lines 1-100)
```javascript
// Imports (1-44)
import { supabase } from './supabaseClient.js';
import { renderDashboard } from '../src/modules/dashboard/dashboard.js';
import { renderUserManagementView } from '../src/modules/userManagement/userManagement.js';
// ... 20+ imports

// State & Init (46-100)
export async function renderCompanyInfo() { ... }
async function initPage() { ... }
document.addEventListener('DOMContentLoaded', initPage);
const ROLE_LABELS = { ... };
```

### 2. 使用者/權限管理 (Lines 129-628) → **已模組化到 `userManagement.js`**
```javascript
// renderAdminUserTable (96-127) - 簡易版用戶表
// renderUserManagementView (130-392) - 完整權限管理視圖
// renderUserManagementRows (394-516) - 表格行渲染
// filterUserTable (518-530) - 搜尋/過濾
// toggleUserPermission (532-550) - 權限切換
// openCreateUserModal / closeCreateUserModal (552-556)
// handleCreateUserSubmit (566-597) - 建立用戶
// openResetPasswordModal / closeResetPasswordModal / handleResetPassword (599-628)
```

### 3. 通用 UI 工具函數 (Lines 630-889) → **建議拆分到 `uiHelpers.js`**
```javascript
// showToast (630-653) - 通知提示
// STATUS_LABELS 常數 (655-662)
// buildApprovalStepperHtml (668-706) - 簽核步驟指示器
// renderAuditTrail (709-769) - 稽核軌跡
// getStatusBadge (771-789) - 狀態徽章
// maskPersonName (793-805) - 姓名遮罩
// maskIdentifierString (808-819) - 身分證遮罩
// getBankNickname (821-824) - 銀行暱稱
// populateBankSelect (826-836) - 銀行下拉選單
// setText (838-843) - 文字設定
// showMessage (845-850) - 訊息顯示
// updateAdminNavVisibility (853-856) - Admin 導航顯示
// applyRoleBasedTabVisibility (858-867) - 角色標籤控制
```

### 4. 核心渲染入口 (Lines 869-909)
```javascript
function render() {
  // Admin 專屬區塊顯示控制
  // 歡迎文字、系統名稱
  // updateAdminNavVisibility()
  // applyRoleBasedTabVisibility()
  // renderDashboard()
  // renderTransactionTable()
  // renderReports() - 僅 accounting/admin
  // renderCompanyData(), fillCompanyInfoForm(), renderBusinessData()
  // updateSettings()
  // renderBankAccounts(), renderVoucherCenter(), renderBudget()
  // renderEquityTab() - 僅 accounting/admin
  // renderTabs()
  // populateProjectDepartmentSelect()
  // renderProjectList()
  // loadAndRenderProjects()
}
```

### 5. 公司/業務資料 (Lines 911-974)
```javascript
// renderCompanyData (911-938) - 公司資訊顯示
// fillCompanyInfoForm (940-955) - 表單填入
// renderBusinessData (957-974) - 營業項目/董監名單
```

### 6. Dashboard 儀表板 (Lines 977-1500+) → **已模組化到 `dashboard.js`**
```javascript
async function renderDashboard() {
  // 角色權限查詢 voucher
  // 專案預算查詢
  // 待辦統計 (pendingReview, pendingAccounting, etc.)
  // 員工專屬計算 (myPendingBillsCount, myApprovedBillsCount)
  // HTML 組裝: Role Banner、Workflow Stepper、Metrics Cards
  // Main Grid: Pending Approvals、Recent Vouchers、Projects Overview
  // Strict Permission Rules Card
}
```

### 7. 交易/銀行帳戶管理 (Lines ~1500-2500)
```javascript
// renderTransactionTable - 交易列表
// renderBankAccounts - 銀行帳戶列表
// addTransactionForm submit - 新增交易
// bankAccountForm submit - 新增/編輯銀行帳戶
// editBankAccount / resetBankForm / deleteBankAccount
// setupTransactionForm - 表單初始化
// populateBankSelect - 銀行下拉選單
// 附件上傳 (saveAttachment, uploadAttachmentFile)
```

### 8. 報支單/簽核流程 (Lines ~2500-3500) → **Phase 3 重點增強**
```javascript
// populateVoucherFormOptions (3144-3273) - 表單選項載入
// addExcelRow (2243-2306) - 動態新增明細行
// toggleInvoiceRequired / calculateVoucherTotal / toggleCategoryNote / toggleProxyPayer
// fetchPayeeName / openAddPayeeModal / submitNewPayee / fetchProxyPayerName
// assignLineAttachment - 附件指派
// voucherCreateForm submit (2913-3030) - 建立報支單 (核心)
// viewVoucherDetail (3740-3864) - 單據詳情 Modal
// processVoidVoucher (3866-3915) - 銷案/返還預算
// renderVoucherWorkflowList (3325-3421) - 簽核中心列表
// renderVoucherCard (3275-3305) - 單據卡片
// buildMiniStepperDots (3308-3323) - 迷你進度點
// openResubmitModal / submitFullResubmission - 重送流程
// openAccountingReviewModal / openCloseVoucherModal - 會計審核/銷案 Modal
```

### 9. 專案/預算管理 (Lines ~3500-4000) → **Phase 4 重點**
```javascript
// renderProjectList (3436-3500) - 專案卡片、預算進度條
// calcRemainingPreview (3503-3513) - 預算預覽
// updateProject (3516-3552) - 更新專案 (含預算異動記錄)
// deleteProject (3595-3600) - 刪除專案
// renderAdminDepartmentList (3603-3622) - 部門管理
// editDepartmentName / deleteDepartment (3625-3653)
// loadAndRenderProjects (3656-3713) - 專案下拉選單
// fetchProjects (3715-3723) - 專案查詢
// loadDepartments (3725-3728)
// renderPermissionCheckboxes (3730-3737) - 權限核取方塊
```

### 10. 財務報表 (Lines ~4000-4800)
```javascript
// renderReports - 四大報表主入口
// switchReportTab - 報表頁籤切換
// renderIncomeStatement / renderBalanceSheet / renderCashflowStatement / renderEquityStatement
// renderTrialBalance / renderFundraisingSnapshot / renderIfrsRules / renderAdjustments / renderNotes
// buildIncomeStatement / buildBalanceSheet / buildCashflowStatement / buildEquityStatement
// buildTrialBalance / buildFundraisingSnapshot / fetchAccountBalancesByCode / getEquityAnalysis
// exportReportsToExcel / exportAuditPackage
// renderFundraisingSimulation - 募資模擬器
// openIfrsAdjustmentModal - IFRS 調整分錄
// bindFinancialNoteEditButtons - 財報附註編輯
```

### 11. 日記帳/憑證中心 (Lines ~4800-5200)
```javascript
// renderJournalFiltered (2021-2060) - 分錄搜尋
// renderVoucherCenter (voucherCenterTableBody) - 憑證中心列表
// voucherSearchInput - 憑證搜尋
```

### 12. Audit Trail/稽核軌跡 (Lines ~5200-5400)
```javascript
// renderAuditTrail (709-769) - 已在工具函數區
// auditTrailActionFilter / auditTrailSearchInput - 過濾器
```

### 13. 事件綁定/初始化 (Lines ~5400-5664)
```javascript
// initializeEvents / initializeEventsInternal (2343-3119)
// Tab 切換綁定 (2504-2542)
// 各表單 submit 綁定: parseStatementBtn, changePasswordForm, companyInfoForm, bankAccountForm, transactionForm, printReportBtn, period-preset-btn, report-tab-btn, fsExpansionCost等, addIfrsAdjustmentBtn, exportAuditPackageBtn, includeIfrsAdjustmentsToggle, showAllReportsBtn, exportExcelBtn, inviteUserForm, voucherCreateForm, projectForm, departmentForm, forcePasswordForm, loginForm, bulkVoucherUpload
// 事件委派: approveBtn, rejectBtn, historyBtn, approve-adj-btn, reverse-adj-btn, delete-adj-btn
// logoutBtn, menuToggleBtn, sidebarOverlay
// initialize() / DOMContentLoaded 監聽
```

---

## 🎯 建議拆分策略

### 已完成模組化 (✅)
| 模組 | 檔案 | 對應 ui.js 區段 |
|------|------|-----------------|
| Dashboard | `src/modules/dashboard/dashboard.js` | Lines 977-1500 |
| User Management | `src/modules/userManagement/userManagement.js` | Lines 129-628 |
| Voucher API | `src/modules/voucher/voucherApi.js` | API 呼叫邏輯 |
| Attachments | `src/modules/voucher/attachments.js` | 附件上傳/刪除 |
| Admin API | `src/modules/admin/adminApi.js` | 用戶/部門/專案 API |
| Budget | `src/modules/budget/budget.js` | 專案預算 API |
| Bank Accounts | `src/modules/bank/bankAccounts.js` | 銀行帳戶 API |
| UI Helpers | `src/modules/utils/uiHelpers.js` | 部分工具函數 |

### 待拆分模組 (🔄)
| 優先級 | 模組名稱 | 來源區段 | 建議檔案 |
|--------|----------|----------|----------|
| **高** | Voucher Form/Workflow | Lines 2500-3500 | `src/modules/voucher/voucherForm.js` |
| **高** | Voucher Workflow List | Lines 3325-3421 | `src/modules/voucher/voucherWorkflowList.js` |
| **中** | Project Management | Lines 3500-4000 | `src/modules/project/projectManagement.js` |
| **中** | Reports/Financial Statements | Lines 4000-4800 | `src/modules/reports/financialReports.js` |
| **中** | Journal/Ledger | Lines 4800-5200 | `src/modules/accounting/journalLedger.js` |
| **低** | Company/Business Data | Lines 911-974 | `src/modules/company/companyData.js` |
| **低** | Transaction/Bank UI | Lines 1500-2500 | `src/modules/transaction/transactionUI.js` |
| **低** | Audit Trail UI | Lines 5200-5400 | `src/modules/audit/auditTrailUI.js` |
| **高** | Event Binding/Init | Lines 5400-5664 | `src/modules/core/eventBinding.js` |

---

## 📝 遷移檢查清單

- [ ] 建立 `src/modules/voucher/voucherForm.js` - 包含 populateVoucherFormOptions, addExcelRow, voucherCreateForm submit, viewVoucherDetail, openResubmitModal 等
- [ ] 建立 `src/modules/voucher/voucherWorkflowList.js` - 包含 renderVoucherWorkflowList, renderVoucherCard, buildMiniStepperDots
- [ ] 建立 `src/modules/project/projectManagement.js` - 包含 renderProjectList, updateProject, deleteProject, renderAdminDepartmentList
- [ ] 建立 `src/modules/reports/financialReports.js` - 包含 renderReports, switchReportTab, 各報表渲染函數
- [ ] 建立 `src/modules/accounting/journalLedger.js` - 包含 renderJournalFiltered, renderVoucherCenter
- [ ] 建立 `src/modules/core/eventBinding.js` - 包含 initializeEvents, 所有表單 submit 綁定, 事件委派
- [ ] 更新 `ui.js` import 並移除已遷移代碼
- [ ] 更新 `test001/netlify/index.html` 確保模組載入順序正確
- [ ] 執行功能測試確認無回歸

---

*最後更新：2026-08-11*
*基於 ui.js v5664 行分析*