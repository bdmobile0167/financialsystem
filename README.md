# 財務管理系統

目前本機版本：`0.2.75`

## 0.2.75 重點

- 新增會計期間/月結鎖帳資料庫地基：`accounting_periods`、close/reopen RPC、RLS 與 audit log。
- Supabase 遠端 project `imlmclalgbfxhhnpsyam` 已直接套用 `accounting_period_locks`。
- 已關帳期間會擋 `journal_entries`、`bank_transactions`、`transactions`、`vouchers` 的新增、修改與刪除。
- 設定頁新增「會計期間 / 月結鎖帳」管理畫面，可關帳、重整期間清單與重開期間。
- Oracle 財務管理能力缺口已拆入 pending：AR、多幣別、稅務、固定資產、催收、收益認列、自助報表與 SOD 儀表板。
- Production 仍需重新部署 `0.2.75` 並做實際登入、報支、付款、收入、財報與月結鎖帳驗收。

## 0.2.74 重點

- 重建 `voucherApi.js`、`attachments.js`、`voucherStatus.js` 與 `uiHelpers.js` 的壞碼區塊，避免未閉合字串造成 App bootstrap 失敗。
- 清除 `openCloseVoucherModal` / `confirmCloseVoucher` 內已不可達的舊付款流程，保留正式付款 queue。
- 清除 `updateVoucher()` 內不可達的舊明細/發票 rewrite block，單據修改只走 Supabase RPC。
- 靜態表單 label 已補 `for`，並新增 runtime label association observer，動態 modal 也會自動補關聯。
- Production 已由後續 `0.2.75` 接續，仍需重新部署並做實際登入、報支、刪除單據、退件重送、付款、財報驗收。

## 0.2.73 重點

- Supabase 遠端已直接新增 `delete_voucher_cascade` RPC，單據刪除改由資料庫一次處理 voucher、明細、發票、付款、workflow、銀行流水、日記帳與手動交易關聯。
- `deleteVoucher()` 已改呼叫 RPC；Storage 附件檔案刪除失敗會回報警示，但不會留下資料庫半刪狀態。
- `update_voucher_with_details` 已直接更新到 Supabase：退件後重送時，主檔/明細/發票/status/workflow log 同一交易完成。
- 重送流程不再由前端另外手動 insert workflow log，避免狀態更新成功但紀錄失敗。
- Production 已由後續 `0.2.75` 接續，仍需重新部署並做實際登入、報支、付款、財報驗收。

## 0.2.72 重點

- 交易入帳現在會清楚顯示 debit/credit：收入預設借方銀行、貸方收入；支出預設借方費用/成本、貸方銀行，且可手動調整。
- 一般員工輸入身分證/統編查無付款人時，可以新增該付款人；仍不開放完整付款人名單。
- 付款人明細 modal 改為不透明白色卡片，可清楚查看付款紀錄並點擊查看單據。
- 銀行帳戶卡片排版調整，長帳號與綁定科目不再擠壓。
- Production 已由後續 `0.2.75` 接續，仍需重新部署並做實際登入、報支、付款、財報驗收。

## 0.2.71 重點

- Supabase schema/RPC 已直接套用到 project `imlmclalgbfxhhnpsyam`，不再只停在本機 migrations。
- 已清理 2 組未核銷、未配對的重複銀行流水，並建立 `bank_statement_transactions_dedupe_key` 唯一索引。
- 已套用 vouchers manager update scope、`profiles.role` `super_admin` constraint，以及報支/會計/付款/主管 atomic RPC。
- 已收斂 atomic voucher RPC 權限：`authenticated` 可執行，`anon` 不可執行。
- Production 已由後續 `0.2.75` 接續，仍需重新部署並做實際登入、報支、付款、財報驗收。

## 0.2.70 重點

- 會計審核改走 `approve_voucher_review_by_accounting` RPC，明細逐列科目、付款人、備註、核准狀態、預算與 workflow log 同一交易完成。
- 付款設定改走 `save_voucher_payment_assignment` RPC，付款人、付款銀行與會計備註不再直接分段寫入 `vouchers`。
- 主管核准/退件與重送改走 RPC，狀態與 workflow log 不再分段寫入。

## 0.2.69 重點

- 單據新增改走 `create_voucher_with_details` RPC，主檔、明細、發票與送出流程紀錄同一交易完成。
- 單據修改改走 `update_voucher_with_details` RPC，主檔、明細、發票與部門/專案預算 scope 不再分段成功。

## 0.2.68 重點

- 已補回遠端 RLS performance cleanup migration 到本機，避免 Supabase migration history 與 repository 不一致。
- 已新增 vouchers manager update scope migration，主管不應只因 `manager` role 就能跨部門更新單據。
- 已新增 `profiles.role` 支援 `super_admin` 的 migration，讓程式與 policy 的 super_admin 權限能被資料庫接受。
- `docs/RLS_GUIDE.md` 已重建為乾淨 UTF-8。
- 銀行對帳單匯入已新增重複資料防呆；同一銀行、日期、摘要、對象、收入/支出與餘額相同的資料會跳過。
- 已新增銀行對帳單匯入唯一索引 migration，部署資料庫時可在 DB 層防止重複匯入。
- 已隔離舊交易表單直寫銀行流水入口，手動收入/支出只保留正式 RPC 流程，同步寫入銀行流水、交易表與日記帳。
- 已修正銀行 PDF 解析 parser key 壞碼，`玉山187` 與 `兆豐` 系列 bankCode 不會再因檔案編碼損壞被判定不支援。
- 已修正 `.gitignore`，移除 `/docs/` 忽略規則，docs 任務與版本紀錄會被 GitHub 追蹤。
- 已補 `pdf-parse` dependency，修正銀行 PDF 解析 API 在 Vercel production 找不到 module 的 500。
- 部署動作依使用者指示保留手動執行；目前需部署 `0.2.75`。


- serverless API 已集中使用 `api/_supabaseServer.js` 驗證 Supabase admin key、登入 session 與角色。
- `/api/invite`、`/api/reset-password`、`/api/notify-payee`、`/api/scan-receipt`、`/api/classify`、`/api/parse-bank-statement` 已清除壞碼訊息。
- 付款通知 API 已限制只有會計與管理角色可觸發。
- AI 科目分類已補強，車馬費、住宿費、軟體授權等不應再一律落到雜項支出。
- 付款通知、AI 憑證掃描與 AI 科目分類 API 已統一支援 `SUPABASE_SECRET_KEY`。
- Vercel production 已查到 `0.2.62` `READY`，`0.2.75` 仍需由使用者推送/部署後驗收。
- `docs/TASKS_PENDING.md` 已整理為單一待辦清單，完成項目移至 completed。
- 獨立收入管理、應收帳款與發票收入流程已列為 `TASK-017` 後續功能。
- 修正 production 入口 `scripts/main.js` 啟動語法錯誤，確保 `scripts/ui.js` 可正常載入。
- 舊版 src/modules/voucher/voucherForm.js 已隔離為 deprecated guard，避免誤用舊付款人新增流程。
- 付款人新增補既有資料保護：身份證/統編已存在時，只回傳既有預設收款帳戶，不讓一般員工新增錯誤銀行帳戶。
- 有填銀行帳號時，付款人新增表單會要求銀行名稱或 7 碼金融機構代號。
- 交易管理的「交易入帳」是目前收入入口，可新增收入並指定借方/貸方科目。

---

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

## GitHub 上傳清單

應上傳：

- `api/`
- `css/`
- `docs/`
- `scripts/`
- `src/`
- `supabase/migrations/`
- `.env.example`
- `.gitignore`
- `CHANGELOG.md`
- `index.html`
- `package.json`
- `README.md`

不要上傳：

- `.env`、`.env.local`、`.env.*.local`
- `.vercel/`、`.netlify/`
- `node_modules/`
- `.tmp-*` 截圖或 smoke-test 暫存資料夾
- 真實 Supabase secret key、Gmail app password、Gemini API key

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




