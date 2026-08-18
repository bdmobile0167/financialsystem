# 待辦任務 (TASKS_PENDING.md)

> 記錄所有**未完成**的任務。完成後移至 `TASKS_COMPLETED.md`。

---

## 🎯 3/11 Plan Integration of Required Features (高優先級)

**來源**：`test001/googleai/` 專案規劃  
**狀態**：🔥 **最高優先級** - 核心功能整合  
**負責**：全團隊

### 待完成項目
- [x] **Plan integration of required features** - 規劃所需功能整合
- [x] **Implement account/permission management with feature selection** - 實作帳號/權限管理與功能選擇 (對應 Phase 1) ✅ 已完成
- [x] **Implement Dashboard** - 實作儀表板 (對應 Phase 2) ✅ 已完成
- [x] **Merge transaction/expense application with approval workflow** - 合併交易/報支申請與簽核流程 (對應 Phase 3) ✅ 已完成 2026-08-17
- [x] **Enhance project management with member editing and audit logs** - 增強專案管理：成員編輯與稽核日誌 (對應 Phase 4) ✅ 已完成 2026-08-17
- [ ] **Enhance voucher/reconciliation features** - 增強憑證/勾稽核對功能 (對應 Phase 5)
- [ ] **Optimize bank account management** - 優化銀行帳戶管理 (對應 Phase 6)


---

## Task-003：Supabase Schema Cleanup

**狀態**：⏳ 待開始  
**優先級**：中  
**負責**：後端 / 資料庫管理員

### 待完成項目
- [ ] 分析所有程式碼使用的資料表與欄位
- [ ] 找出不存在的欄位（如 `attachment_name`、`voucher_month`）
- [ ] 找出多餘/未使用欄位（例如 `adminApi.js` 中未被呼叫、欄位名稱與實際 schema 不符的 `updateProjectBudget`/`fetchProjectBudgetLogs`，實際使用的是 `budget.js` 版本）
- [ ] 整理 Foreign Key / Constraint / Default / Index / RLS
- [ ] 更新 `DATABASE.md` 反映最新 Schema
- [ ] 更新 `CHANGELOG.md`

---

## Task-004：API Cleanup

**狀態**：⏳ 待開始  
**優先級**：中  
**負責**：前端 / 後端

### 待完成項目
- [ ] 分析 Voucher / Budget / Report / Journal / Approval 現有寫法
- [ ] 統一 CRUD repository 層（減少散落在各處的 Supabase 直接呼叫）
- [ ] 更新 `API.md` 文檔
- [ ] 更新 `CHANGELOG.md`

---

## Task-005：Journal Engine

**狀態**：⏳ 待開始  
**優先級**：中  
**負責**：前端 / 會計邏輯

### 待完成項目
- [ ] 建立 Voucher → Voucher Line → Journal Entry → Ledger → Report 完整串接
- [ ] 新增自動平衡（auto-balance）機制
- [ ] 新增借貸檢查（debit/credit check）
- [ ] 更新 `CHANGELOG.md`

---

## Task-006：前端防呆完善（RLS 相關）

**狀態**：⏳ 待開始  
**優先級**：低  
**負責**：前端

### 待完成項目
- [ ] `reports.js` 所有 `.single()` 改為 `.maybeSingle()` 並加入降級邏輯
- [ ] `ui.js` 所有角色判斷集中化，避免重複邏輯
- [ ] 加入錯誤邊界與友善提示

---

*最後更新：2026-08-17*