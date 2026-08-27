# 財務管理系統

目前本機版本：`0.2.55`

這是以 Supabase + Vercel 為核心的公司財務管理系統，涵蓋報支、會計審核、付款管理、憑證、銀行流水、預算、薪資付款、財報與 Audit Trail。

## 專案資訊

- GitHub：`bdmobile0167/financialsystem`
- Vercel project：`financialsystem`
- Production domain：`financialsystem-nine.vercel.app`
- Supabase project ref：`imlmclalgbfxhhnpsyam`
- 本機正式目錄：`C:\Users\BDPM\Desktop\bdm0167\表格自動化\netlify`

## 目前重點

- 前端 Supabase URL / anon key 已改由 `/api/public-config` 讀取 Vercel env，本機靜態測試才使用 fallback。
- Supabase Auth invite 已改為正確語意：API 成功只代表 Supabase 接受邀請請求，實際 SMTP 投遞需看 Supabase Auth logs 或 SMTP test email。
- 財報與 journal 明細已對 `journal_entries` 分頁查詢，避免超過 1000 筆後漏算。
- 付款銷帳已依 `voucher_lines.account_code` 逐科目建立分錄，支援同一張 voucher 多個會計科目。
- 通知鈴鐺已支援 Supabase Realtime，並保留 30 秒輪詢備援。
- 薪資勞保、健保、勞退代收統編改由 `payroll_agency_mappings` 管理。
- 付款設定可列出明細項目與收款人；會計/管理員可用姓名、身分證/統編、銀行、戶名或帳號搜尋收款人。

## 環境變數

請參考 `.env.example` 與 `docs/ENVIRONMENT.md`。正式環境至少需要：

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY` 或相容舊設定 `SUPABASE_SERVICE_ROLE_KEY`
- `APP_LOGIN_URL`
- `GEMINI_API_KEY`

若要用 Supabase 官方 invite 信：

- `INVITE_EMAIL_PROVIDER=supabase`
- Supabase Dashboard 的 Authentication SMTP 必須通過 test email。

若改用 Gmail nodemailer：

- `GMAIL_USER`
- `GMAIL_APP_PASSWORD`

## 本機啟動

此專案是靜態前端 + Vercel Serverless API。前端需透過 HTTP server 開啟：

```powershell
python -m http.server 8123
```

瀏覽：

```text
http://127.0.0.1:8123/
```

## 驗證指令

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/tools/lint-migrations.ps1
```

若有 Node/npm：

```powershell
npm run lint:migrations
```

## 主要文件

- `docs/AI_ENTRY_POINT.md`：Codex / AI 交接入口。
- `docs/VERSION.md`：版本紀錄。
- `CHANGELOG.md`：變更紀錄。
- `docs/TASKS_PENDING.md`：未完成工作。
- `docs/TASKS_COMPLETED.md`：完成紀錄。
- `docs/API.md`：API 與 env 說明。
- `docs/ARCHITECTURE.md`：架構紀錄。
- `docs/DATABASE.md`：資料庫與 migration 紀錄。
- `docs/RLS_GUIDE.md`：RLS 權限紀錄。
- `docs/SUPABASE_EMAIL_LOGIN.md`：Supabase SMTP 與登入邀請排查。

## 待辦重點

- Production 重新部署並做 Vercel / Supabase invite 驗收。
- Supabase Dashboard SMTP test email 仍需確認實際投遞。
- 外部 Git server 仍需 SSH key / remote push。
- 多收款人付款拆分仍是較大的後續資料模型調整。
