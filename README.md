# 財務管理系統

目前本機版本：`0.2.26`

這是部署於 Vercel、以 Supabase 為後端的財務管理系統。功能包含登入與權限、報支簽核、銀行帳戶與勾稽、專案預算、會計分錄、四大財報、IFRS 調整、通知及帳號管理。

## 目前狀態

- GitHub：`bdmobile0167/financialsystem`
- Vercel 專案：`financialsystem`
- Supabase project ref：`imlmclalgbfxhhnpsyam`
- 正式本機目錄：`C:\Users\BDPM\Desktop\bdm0167\表格自動化\netlify`
- 本機版本 `0.2.26` 尚未推送前，GitHub／Vercel 仍顯示 `0.2.16`。

## 本輪更新

- 四大財報改為獨立 A4 頁面，支援單頁或四份列印。
- 銷帳改為原子、可重試的 Supabase RPC，修正重複分錄 409。
- 修正帳號權限 trigger 與新帳號邀請權限。
- 修正財報公司抬頭、已投入股本來源與資產負債表權益呈現。
- 重建 Audit Trail 版面，新增桌面側欄收合。
- 銀行帳戶完成會計科目綁定，部門可建立下層組別。
- 修正批准流程誤查 `invoices.created_at`。
- 修正專案成員名單與可見專案使用不同資料表造成的授權失效。
- 合併帳號與功能權限管理，已開通帳號可直接編輯姓名、角色、部門與功能。
- 公司基本資料、營業項目與股東出資改由 Supabase 管理，已投入股本納入財報。
- 匯入原始 Excel 的 21 筆銀行歷史流水，並保留可重跑的去重條件。
- 修正報支清單重複顯示「查看歷程」。
- 會計與管理員可對已銷帳單據銷案，原因必填並寫入稽核紀錄。
- 會計科目選單改用共用 API，並顯示空資料或 RLS 錯誤。
- 合併兩個分岔的本機副本，統一以 `表格自動化\netlify` 為正式開發目錄。
- 保留較新的權限、Auth Provider、Repository、交易與傳票模組。
- 修正 Dashboard 因未載入 Tailwind 而失去 grid、卡片與間距的問題。
- Dashboard 改為專案內建語意化 CSS，支援桌機、平板與手機。
- 修正 header 漢堡按鈕及專案選單排列。
- 移除舊部署平台設定與 Identity 死碼，正式部署統一使用 Vercel。
- 全部文件改為 UTF-8 繁體中文。

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
- `scripts/ui.js`：目前 UI 協調器
- `src/modules/`：各功能模組
- `api/`：Vercel Serverless API
- `docs/AI_ENTRY_POINT.md`：開發與 AI 入口

## 安全注意

- 前端只能放 Supabase publishable key。
- service role、SMTP 與 AI key 必須放在 Vercel Environment Variables。
- 正式財報以 `journal_entries` 為核心來源。
- 銀行實際餘額只供 reconciliation，不可直接覆寫財報。
