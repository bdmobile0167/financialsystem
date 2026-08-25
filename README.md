# 財務管理系統

目前本機版本：`0.2.45`

這是部署於 Vercel、以 Supabase 為後端的財務管理系統。功能包含登入與權限、報支簽核、付款管理、銀行帳戶與勾稽、專案與部門預算、會計分錄、四大財報、IFRS 調整、通知、Audit Trail 與帳號管理。

## 目前狀態

- GitHub：`bdmobile0167/financialsystem`
- Vercel 專案：`financialsystem`
- Production domain：`financialsystem-nine.vercel.app`
- Supabase project ref：`imlmclalgbfxhhnpsyam`
- 正式本機目錄：`C:\Users\BDPM\Desktop\bdm0167\表格自動化\netlify`
- 本機版本 `0.2.45` 尚未推送前，GitHub／Vercel 仍不代表已同步。

## 最新整理

- README、CHANGELOG 與 docs 已重新整理為 UTF-8 繁體中文。
- `docs/TASKS_PENDING.md`、`docs/AI_ENTRY_POINT.md`、`docs/BUGS.md`、`docs/DATABASE.md`、`docs/API.md`、`docs/ARCHITECTURE.md`、`docs/SUPABASE_EMAIL_LOGIN.md` 已從亂碼狀態重建。
- 最新功能狀態以 `docs/VERSION.md`、`docs/TASKS_COMPLETED.md`、`docs/TASKS_PENDING.md` 為準。
- 變更歷史集中在 `CHANGELOG.md`，README 只保留目前開發者需要看的入口。

## 已完成重點

- 會計審核可逐筆報支明細指定會計科目，並可批次套用同一科目到全部明細。
- AI 科目建議可針對單筆明細分析，車馬費、交通費、住宿費等優先建議差旅費，不再一律落到雜項支出。
- 設定頁新增會計科目管理，會計、管理員、超級管理員可維護 `accounts` 代碼、名稱與類型。
- 報支付款人欄位改為輸入身分證/統編後帶出中間為 `O` 的遮罩姓名，一般員工與主管不能查詢完整付款人主檔。
- 付款管理已拆分準備付款與所有付款人，並支援付款人明細、薪資批次付款、付款憑證流水號。
- 付款管理按鈕已改為明確的付款設定/確認流程；付款完成後才會轉成已付款並建立付款憑證、銀行流水與日記帳。
- 預算管理支援部門預算申請、審核、期初編列、實際使用與 Audit Trail。
- 公司基本資料、營業項目、董監名單、股東出資與已投入股本已改由 Supabase 管理。
- 財報正式以 `journal_entries` 與 `accounts` 為核心來源，銀行實際餘額僅供勾稽參考。

## 主要待辦

- Vercel Production 已由使用者回報設定 `SUPABASE_SECRET_KEY`，仍需重新部署並用邀請帳號流程驗收。
- Supabase Auth SMTP 已由使用者回報建立；若要使用 Supabase 官方邀請信，Vercel 需設定 `INVITE_EMAIL_PROVIDER=supabase`。
- 多收款人付款拆分尚未實作，已整合記錄於 `docs/TASKS_PENDING.md`。
- Production 尚未完成 `0.2.45` 部署與四 viewport 驗收。
- `scripts/ui.js` 仍需持續拆分，降低單檔維護成本。

## 文件入口

- `docs/AI_ENTRY_POINT.md`：下一輪 AI / Codex 進場時先讀這份。
- `docs/VERSION.md`：版本與發布檢查。
- `CHANGELOG.md`：完整變更紀錄。
- `docs/TASKS_PENDING.md`：未完成工作。
- `docs/TASKS_COMPLETED.md`：已完成工作。
- `docs/BUGS.md`：問題紀錄。
- `docs/API.md`：Vercel Serverless API 與環境變數。
- `docs/DATABASE.md`：Supabase 資料表、RPC、migration 摘要。
- `docs/ARCHITECTURE.md`：系統架構。
- `docs/RLS_GUIDE.md`：RLS 與安全政策。
- `docs/SUPABASE_EMAIL_LOGIN.md`：Supabase 邀請信與 SMTP 設定。

## 本機啟動

專案是原生 ES module，需使用 HTTP server，不能直接雙擊 `index.html`。

```powershell
python -m http.server 8123
```

開啟：

```text
http://127.0.0.1:8123/
```

## 主要路徑

- `index.html`：頁面結構
- `css/styles.css`：全站與響應式樣式
- `scripts/main.js`：啟動入口
- `scripts/ui.js`：目前主要 UI 協調器
- `src/modules/`：已拆分的功能模組
- `api/`：Vercel Serverless API
- `supabase/migrations/`：本機保留的資料庫 migration

## 安全注意

- 前端只能放 Supabase publishable / anon key。
- service role、SMTP 與 AI key 必須放在 Vercel Environment Variables。
- 正式財報以 `journal_entries` 為核心來源。
- 銀行實際餘額只供 reconciliation，不可直接覆寫財報。
