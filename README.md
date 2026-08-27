# 財務管理系統

目前本機版本：`0.2.48`

這是一套串接 Supabase 與 Vercel 的財務管理系統，涵蓋報支、會計審核、付款管理、銀行流水、專案與部門預算、薪資付款、財務報表、公司資料與 Audit Trail。

## 系統資訊

- GitHub：`bdmobile0167/financialsystem`
- Vercel 專案：`financialsystem`
- Production domain：`financialsystem-nine.vercel.app`
- Supabase project ref：`imlmclalgbfxhhnpsyam`
- 本機目錄：`C:\Users\BDPM\Desktop\bdm0167\表格自動化\netlify`
- 本機版本 `0.2.48` 尚未確認已推送 GitHub / 部署 Vercel。

## 近期完成

- 付款管理按鈕改為「付款設定／確認付款」，移除容易誤解的 checkbox。
- 確認付款前會檢查收款人、收款銀行、收款戶名、收款帳號、會計科目、公司付款銀行與付款日期。
- 付款設定開啟失敗時會直接顯示錯誤，不再像按鈕沒有反應。
- 付款管理按鈕已改用 JS 事件代理，不再依賴 inline onclick。
- 付款設定視窗會先開啟再載入資料，並補齊 `.modal-backdrop` 顯示樣式。
- Supabase `close_voucher_by_accounting` RPC 已允許 `super_admin` 執行付款銷案。
- 付款人隱私已收斂：一般員工/主管只輸入身分證或統編並看到 `O` 遮罩姓名。
- 會計審核支援逐筆明細歸類、AI 科目建議與會計科目管理。
- 預算管理支援申請/審核流程與 Audit Trail。
- 事業項目、董監名單、公司股本來源已改為 Supabase 管理資料。

## 付款操作

在付款管理中，會計、管理員或超級管理員要按「付款設定／確認付款」。開啟視窗後，確認或補齊收款人銀行資料、會計科目、公司付款銀行與付款日期，再按「確認已付款」。

付款完成後：

- 待付款篩選中該筆會消失。
- 切到「已付款」或「全部」可看到付款狀態與付款憑證。
- 系統會建立付款憑證、銀行流水與日記帳。

如果按下「付款設定／確認付款」後沒有視窗，請確認瀏覽器是否載入 `0.2.48`；新版會先顯示付款設定視窗與「載入付款設定...」。

## 主要待辦

- Vercel Production 重新部署並驗收 `0.2.48`。
- 驗證 Supabase Auth SMTP 邀請流程與 `INVITE_EMAIL_PROVIDER=supabase`。
- 外部 Git server repository 初始化與 push。
- 多收款人付款拆分資料結構與 UI。
- 薪資付款的部門預算扣減邏輯。
- Supabase advisor / RLS / production viewport 持續驗收。

## 文件入口

- `docs/AI_ENTRY_POINT.md`：AI / Codex 接手入口。
- `docs/VERSION.md`：版本紀錄。
- `CHANGELOG.md`：變更紀錄。
- `docs/TASKS_PENDING.md`：未完成工作。
- `docs/TASKS_COMPLETED.md`：已完成工作。
- `docs/BUGS.md`：問題追蹤。
- `docs/API.md`：API 說明。
- `docs/DATABASE.md`：資料庫與 migration 摘要。
- `docs/RLS_GUIDE.md`：RLS 權限指南。
- `docs/SUPABASE_EMAIL_LOGIN.md`：Supabase SMTP 與登入邀請。

## 本機啟動

本專案使用 ES module，請用 HTTP server 開啟：

```powershell
python -m http.server 8123
```

然後開啟：

```text
http://127.0.0.1:8123/
```

## 安全事項

- 不要把 Supabase secret/service role key、SMTP 密碼或 AI key 寫入前端檔案。
- secret/service role key 必須只放在 Vercel Environment Variables。
- 付款完成才會產生日記帳、銀行流水與付款憑證。
