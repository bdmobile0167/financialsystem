# AI 入口文件 - 財務管理系統文檔導航

> **重要：每次 AI 進入專案時，必須先閱讀此文件，了解文檔結構與專案現況。**

---

## 📁 文檔目錄結構

```
test001/docs/
├── AI_ENTRY_POINT.md          ← 你現在正在閱讀的文件（必讀）
├── ARCHITECTURE.md            ← 系統架構總覽
├── DATABASE.md                ← 資料庫結構與 RLS 權限
├── API.md                     ← API 介面文檔
├── CHANGELOG.md               ← 版本變更記錄
├── BUGS.md                    ← Bug 追蹤記錄
├── RLS_GUIDE.md               ← RLS 權限修正指南（給 Supabase 執行）
├── VERSION.md                 ← 版本管理規範與歷史
├── TASKS_PENDING.md           ← 待辦任務（未完成）
├── TASKS_COMPLETED.md         ← 已完成任務
└── TASKS_NEW_FEATURES.md      ← 新功能規劃
```

---

## 🎯 專案現況快速掌握

| 項目 | 狀態 | 說明 |
|------|------|------|
| **當前版本** | Demo v2.9.3 | 多租戶基礎遷移階段 |
| **核心架構** | Netlify 前端 + Supabase 後端 | 前端靜態部署，資料庫含 RLS |
| **主要模組** | Voucher(報支單)、Reports(報表)、Dashboard、Journal(日記帳)、Bank(銀行帳戶) | |
| **角色權限** | `employee` / `manager` / `accounting` / `admin` / `super_admin` | 依 `profiles.role` 區分 |
| **關鍵問題** | Employee 406 RLS 權限 | 已診斷完成，待 Supabase 執行 SQL |

---

## 📋 任務狀態總覽

### ✅ 已完成
- **Task-002**：Voucher 模組修復（統一 API、重送流程、附件管理、workflow log 修正）
- **Task-003a 診斷階段**：Employee 406 RLS 權限問題診斷完成，已產出修正 SQL

### 🔄 進行中 / 待處理
- **Task-003a 執行階段**：Supabase 執行 RLS_FIX_guide.md 中的 SQL policy
- **Task-003**：Supabase Schema Cleanup
- **Task-004**：API Cleanup
- **Task-005**：Journal Engine

### 🆕 新功能規劃（來自 IMPLEMENTATION_PLAN.md）
- 階段 1：核心架構與權限系統
- 階段 2：Dashboard 重構
- 階段 3：交易/報支申請合併與簽核流程
- 階段 4：專案管理增強
- 階段 5：憑證與勾稽核對
- 階段 6：銀行帳戶優化
- 階段 7：日記賬與總分類帳增強
- 階段 8：文件更新

---

## 🚀 快速開始指引

### 如果你要...
| 目的 | 閱讀文件 |
|------|----------|
| 了解系統整體架構 | `ARCHITECTURE.md` |
| 查看資料表結構與權限 | `DATABASE.md` |
| 查看 API 介面定義 | `API.md` |
| 了解版本變更歷史 | `CHANGELOG.md` |
| 查找已知 Bug 與修正 | `BUGS.md` |
| 協助 Supabase 設定 RLS | `RLS_GUIDE.md` |
| 了解版本規範與歷史 | `VERSION.md` |
| 查看待辦任務 | `TASKS_PENDING.md` |
| 查看已完成任務 | `TASKS_COMPLETED.md` |
| 查看新功能規劃 | `TASKS_NEW_FEATURES.md` |

---

## ⚠️ 重要提醒

1. **RLS 權限問題**：Employee/Manager 角色無法讀取財務資料表（`accounts`、`journal_entries` 等），這是**設計預期**。前端已修正不再觸發查詢。Supabase 只需依 `RLS_GUIDE.md` 建立 policy 即可。

2. **多租戶架構**：目前處於遷移階段，`company_id` 欄位已在規劃中，RLS policy 如需多租戶請在 `USING` 條件加入租戶過濾。

3. **版本號**：維持 `Demo v2.9.3`，待 Phase-1 全部完成並測試後再統一升版。

4. **三個 netlify 專案**：
   - `test/netlify` - 主開發環境
   - `test001/netlify` - 功能整合測試環境（含 IMPLEMENTATION_PLAN.md）
   - `表格自動化/netlify` - 生產/備份環境
   三者 docs 內容大同小異，以 `test/netlify/docs` 為主。

---

## 📝 更新規則

- **完成任務** → 更新 `TASKS_COMPLETED.md`、從 `TASKS_PENDING.md` 移除、更新 `CHANGELOG.md`
- **新增任務** → 加入 `TASKS_PENDING.md` 或 `TASKS_NEW_FEATURES.md`
- **發現 Bug** → 記錄於 `BUGS.md`，並建立對應 Task
- **修改架構/資料庫/API** → 同步更新 `ARCHITECTURE.md`、`DATABASE.md`、`API.md`

---

*最後更新：2026-08-11*
*維護者：AI Assistant*