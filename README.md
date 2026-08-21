# 財務管理系統

目前本機版本：`0.2.22`

這是部署於 Vercel、以 Supabase 為後端的財務管理系統。功能包含登入與權限、報支簽核、銀行帳戶與勾稽、專案預算、會計分錄、四大財報、IFRS 調整、通知及帳號管理。

## 目前狀態

- GitHub：`bdmobile0167/financialsystem`
- Vercel 專案：`financialsystem`
- Supabase project ref：`imlmclalgbfxhhnpsyam`
- 正式本機目錄：`C:\Users\BDPM\Desktop\bdm0167\表格自動化\netlify`
- 本機版本 `0.2.22` 尚未推送前，GitHub／Vercel 仍顯示 `0.2.16`。

## 本輪更新

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
