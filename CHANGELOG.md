# 變更紀錄

## 0.2.64 - 2026-08-31

- 修正 `.gitignore`，移除 `/docs/` 忽略規則，讓任務、版本、API、資料庫與交接文件能上傳到 GitHub。
- 重建 `.gitignore` 為可讀規則，保留 `node_modules/`、`.env*.local`、`.vercel/`、`.netlify/`、暫存截圖與本機產物忽略。
- README 補上 GitHub 上傳清單與不要上傳的本機/secret 檔案清單。
- 部署動作依使用者指示保留手動執行；本機只完成程式與文件更新。
## 0.2.63 - 2026-08-31

- 補上 `pdf-parse` dependency，修正 Vercel production `/api/parse-bank-statement` 找不到 module 造成 500。
- `/api/parse-bank-statement` 改為在驗證 `fileBase64` 與 `bankCode` 後才載入 PDF parser，缺參數會正確回 400，不會因 cold start module 載入失敗先炸掉。
- 部署動作依使用者指示保留手動執行；本機只完成程式與文件更新。
## 0.2.62 - 2026-08-31

- 新增 `api/_supabaseServer.js`，集中 server-side Supabase admin key 檢查、登入驗證與角色檢查。
- 重寫 `/api/invite`、`/api/reset-password`、`/api/notify-payee`、`/api/scan-receipt`、`/api/classify` 與 `/api/parse-bank-statement` 的壞碼訊息，避免 serverless API 因亂碼字串造成載入或錯誤提示異常。
- `/api/notify-payee` 補後端角色限制，只有 `admin`、`super_admin`、`accounting` 可寄付款通知。
- `/api/classify` 明確要求 AI 選最接近會計科目，低信心才標記人工確認，不再把車馬、住宿、軟體授權等常見項目預設丟到雜項支出。
- 前端 `inviteNewUser()` 修復壞掉的錯誤字串與 JSON 解析 fallback，避免帳號邀請 module 載入失敗。
## 0.2.61 - 2026-08-28

- `api/notify-payee.js`、`api/scan-receipt.js`、`api/classify.js` 改為優先使用 `SUPABASE_SECRET_KEY`，並保留 `SUPABASE_SERVICE_ROLE_KEY` 舊設定相容。
- 三支 server API 補 admin key 類型檢查，避免誤把 publishable/anon key 當作 server-side key 時產生難追的 production 錯誤。
- 透過 Vercel MCP 確認 `financialsystem` project 最新 production deployment 為 `READY`，commit message 為 `Version 0.2.61`。
- 透過 Vercel runtime logs 查詢 production 近 1 小時 error：未找到錯誤紀錄。
## 0.2.60 - 2026-08-28

- 整理 `docs/TASKS_PENDING.md`，移除重複 P0 區塊與已完成項目，讓 pending 只保留仍需處理或驗收的工作。
- 新增 `TASK-017：獨立收入管理流程`，記錄目前收入可由交易管理入帳，但正式收入申請、應收帳款與發票收入流程尚未建立。

## 0.2.59 - 2026-08-28

- 修正 `scripts/main.js` 的啟動錯誤處理字串，避免入口檔語法錯誤導致 `scripts/ui.js` 無法載入。
- 將未被 production 入口使用且已亂碼的 `src/modules/voucher/voucherForm.js` 改為 deprecated guard module，避免未來誤 import 後覆蓋正式付款人新增流程。
- 已用本機 HTTP server 與 Chrome headless 截圖驗證登入頁可載入，未出現啟動失敗 banner。

## 0.2.58 - 2026-08-28

- `create_payee_from_identifier` 補強既有付款人處理：身份證/統編已存在時，只回傳既有預設收款帳戶，不讓一般員工透過 RPC 新增第二套銀行帳戶。
- 新付款人仍可在新增時同步建立 `payment_recipients`，保留付款管理可帶入銀行資料的流程。
- 付款人新增 modal 補前端檢核：有填銀行帳號時，必須填銀行名稱或 7 碼金融機構代號，避免產生付款時不可用的半套資料。
- 已用 rollback 測試確認：新付款人會產生收款帳戶；既有付款人不會被注入新的銀行帳戶。
- 已用測試收入單確認 `create_manual_bank_transaction_entry` 會同步寫入 `bank_transactions`、`transactions`、`journal_entries`，並用正式刪除 RPC 清理測試資料。

## 0.2.57 - 2026-08-28

- 付款人新增 modal 補「銀行名稱」欄位，避免只填金融代號與帳號時，付款管理缺少收款銀行名稱。
- `create_payee_from_identifier` 改為新增付款人後同步建立 `payment_recipients` 預設收款帳戶。
- 已用一般員工身分 rollback 測試新增付款人，再以 admin 身分確認 `payment_recipients` 有銀行名稱、金融代號、戶名與帳號。

## 0.2.56 - 2026-08-28

- 交易管理新增「交易入帳」表單，會計/管理員可直接建立收入或支出，並指定借方與貸方會計科目。
- 新增 Supabase RPC `create_manual_bank_transaction_entry`，手動交易會同步寫入 `bank_transactions`、`transactions` 與 `journal_entries`。
- 新增 Supabase RPC `delete_manual_bank_transaction_entry`，刪除手動交易時會同步清除銀行流水、交易表與日記帳。
- 交易清單新增借方/貸方欄位，方便查核每筆手動交易是否已入帳到正確科目。
- 交易頁載入條件修正：有財務或日記帳權限時會載入銀行帳戶與會計科目下拉，避免表單可見但選項空白。
- 「刪除全部無憑證」改為刪除所有未關聯 voucher 的手動交易，包含自動產生 `TX-...` 單號的收入/支出。
- 一般員工輸入身分證/統編查無付款人時，可透過 `create_payee_from_identifier` 受控新增該筆付款人；仍不開放完整付款人名單。
- 修正 `create_payee_from_identifier` 的 `identifier` 欄位名稱衝突，避免一般員工新增付款人時 RPC 失敗。
- 銀行帳戶頁改為卡片式排版，並補強付款人明細 modal 的實底背景與點擊可用性。
- 收斂財務敏感表 grants：撤除 `anon` 對付款人、收款帳戶、銀行流水、交易表與日記帳的表權限；`authenticated` 僅保留 CRUD。
- 收斂 `bank_accounts` grants：撤除匿名表權限，登入者只保留 CRUD，實際可見資料仍由 RLS 限制會計/管理角色。

## 0.2.55 - 2026-08-27

- 修正付款銷帳 RPC：有 `voucher_lines.account_code` 時，`journal_entries` 依明細科目與金額逐科目入帳，不再整張單用單一 `accounting_account_id`。
- 移除 `journal_entries_one_per_voucher` 唯一索引，允許同一張 voucher 產生多筆分錄；保留一般 `idx_journal_entries_voucher_id` 查詢索引。
- 新增 `voucher_lines.created_at`，支援付款分錄重建排序。
- 已修復 `VOU-20260825-5269`：分錄現在為 `6110 差旅費 2,000`、`6230 雜項支出 20,000`。
- 已批次重建已關帳且明細科目完整的舊 voucher 分錄。

## 0.2.54 - 2026-08-27

- 新增 `/api/public-config` 與 `.env.example`，前端 Supabase URL / anon key 改以 Vercel env 為正式來源，本機保留 fallback。
- 重寫 `/api/invite` 可讀訊息；Supabase Auth invite 現在回報「邀請請求已交給 Supabase」，不再保證背景 SMTP 已寄出。
- `journal_entries` 財報核心查詢與 journal 明細改為 `.range()` 分頁，避免超過 Supabase 單次 1000 筆限制時靜默漏資料。
- 通知鈴鐺新增 Supabase Realtime 訂閱 `public.notifications`，保留 30 秒輪詢備援。
- 新增 `payroll_agency_mappings`，薪資勞保/健保/勞退代收統編改由資料表設定；遠端 migration 已套用。
- 修正 `close_voucher_by_accounting`、`create_payroll_payment_batch` 角色判斷回歸，最終 RPC 已改用 `public.get_my_role()`。
- 新增 `scripts/tools/lint-migrations.ps1` 與 `npm run lint:migrations`，防止新 migration 再直接查 `profiles.role`。
- 付款設定的收款人搜尋改為重建選項清單，可用姓名、身分證/統編、銀行、戶名或帳號搜尋；此功能仍只在會計/管理員付款管理中可見。

## 0.2.53 - 2026-08-27

- 付款設定新增「付款項目」區塊，列出明細筆數、每筆摘要、原填收款人、金額與科目。
- 「更換本筆付款人」新增搜尋框，可用姓名、身分證/統編、銀行、戶名或帳號篩選收款人。
- 收款人下拉保留同一付款人的多帳戶優先排序，並支援搜尋其他付款人帳戶。

## 0.2.52 - 2026-08-27

- 付款清單查詢補回 `primary_payee_id`，付款設定可依原始付款人帶入同一付款人的所有收款帳戶。
- 「更換本筆付款人」下拉改為優先列出同一付款人的多個帳戶，並在選項中顯示銀行與帳號。
- 「所有付款人」列表的銀行資料欄改為列出該付款人的全部 `payment_recipients` 帳戶。
- 新增 Supabase migration，移除 `payment_recipients(payee_id)` 唯一限制，允許同一付款人有 2-3 個以上不同收款帳戶。
- 重寫付款人自動帶入與薪資付款 helper，改用既有預設帳戶，不再依賴 `on conflict (payee_id)`。

## 0.2.51 - 2026-08-27

- 付款設定改為固定確認既有付款金額、收款人與收款帳戶，付款階段不再把帳號欄位當作可編輯主檔。
- 新增「更換本筆付款人」區塊；只有收款人錯誤時才展開下拉更換該張 voucher 的付款人。
- `savePaymentAssignment()` 不再更新 `payment_recipients` 銀行帳號主檔，避免付款確認誤改付款人資料。
- 付款確認仍會檢查收款銀行、戶名、帳號、付款銀行與付款日期是否完整。

## 0.2.50 - 2026-08-27

- 透過 Supabase Auth logs 確認官方 invite 信件 500 根因：SMTP host 被填成 `https://financialsystem-nine.vercel.app/?`。
- `docs/SUPABASE_EMAIL_LOGIN.md` 補上 SMTP Settings 正確欄位格式、Dashboard 修正位置與 Management API 修正方式。
- 新增 `scripts/tools/update-supabase-smtp.ps1`，可用 Supabase Personal Access Token 從本機更新 Auth SMTP config，並防止 host 填入 URL 或 `:465`。
- `TASKS_PENDING` 與 `BUGS` 記錄後續仍需修正 Supabase Dashboard / Management API 設定並重送 invite 驗收。

## 0.2.49 - 2026-08-27

- 付款設定移除會計科目下拉，付款階段不再重新選科目。
- 付款設定改為唯讀顯示會計審核階段已指定的每筆 `voucher_lines.account_code`，多筆明細會逐筆列出。
- 付款清單「科目／付款銀行」可顯示多科目摘要，例如 `多科目：6110、6250`。
- 確認付款沿用既有 `accounting_account_id` 或明細第一個 `account_code` 作為銷案 RPC 參照，不再覆寫明細科目。
- 會計備註會依付款日期自動帶入 `MMDD_摘要`，例如 `0827_XXX`；手動修改後不再自動覆蓋。

## 0.2.48 - 2026-08-27

- 付款設定改為先建立 modal，再背景載入付款人、會計科目與公司銀行帳戶，避免按鈕停在「開啟中」但沒有視窗。
- 付款設定資料載入加入 12 秒逾時提示；失敗時會在 modal 內顯示錯誤與重新載入按鈕。
- 補上 `.modal-backdrop` 全域樣式，確保付款 modal 以 fixed overlay 顯示。
- 收款人可用性判斷改為 `active !== false`，避免 active 欄位空值時全部被隱藏。

## 0.2.47 - 2026-08-27

- 付款清單操作按鈕改用 `data-payment-action` 與 `paymentList` click 事件代理，不再依賴 inline `onclick`。
- 按「付款設定／確認付款」時會進入「開啟中...」狀態，讓會計知道點擊事件已收到。
- `scripts/main.js` 的 UI 載入失敗訊息改為可讀中文，方便定位整個 UI module 載入失敗。
- 文件同步 `0.2.47`，並記錄 production 仍需重新部署驗收。

## 0.2.46 - 2026-08-25

- 付款管理開啟付款設定時加入錯誤提示；若權限不足、付款資料不存在或 Supabase 查詢失敗，不再看起來像按鈕無反應。
- 付款設定視窗補上付款人與付款銀行缺資料提示，會計可先知道要補主檔或銀行帳戶。
- 文件補充付款清單的正確操作方式：按「付款設定／確認付款」後填齊收款資料、會計科目、公司付款銀行與付款日期，再按「確認已付款」。
- 同步重建亂碼 docs，保留未完成任務於 `TASKS_PENDING`，已完成項目移至 `TASKS_COMPLETED`。

## 0.2.45 - 2026-08-25

- 付款清單移除容易誤解的 checkbox，改以狀態 badge 顯示「待處理／已完成」。
- 待付款操作按鈕改為「付款設定／確認付款」，明確表示需進入付款設定視窗完成付款。
- 確認付款前先檢查收款人、收款銀行、收款戶名、收款帳號、會計科目、付款銀行與付款日期，避免先寫入空付款設定。
- `savePaymentAssignment()` 加入狀態更新結果檢查；若單據已非待付款，會提示重新整理付款清單。
- Supabase `close_voucher_by_accounting` RPC 補允許 `super_admin` 執行付款銷案。

## 0.2.44 - 2026-08-25

- `api/invite.js` 新增 Supabase 官方邀請信模式；Vercel 設定 `INVITE_EMAIL_PROVIDER=supabase` 後會改用 `supabase.auth.admin.inviteUserByEmail()`。
- 帳號邀請成功訊息會依 `emailProvider` 顯示 Supabase 邀請連結或 Gmail 初始密碼流程。
- 文件更新：使用者已回報設定 `SUPABASE_SECRET_KEY` 與 Supabase Authentication SMTP，目前改列為待重新部署與邀請流程驗收。
- 新增外部 Git server 空 repository 架設待辦；目前本機找不到 `git`，且 SSH key 尚未加入帳號。

## 0.2.43 - 2026-08-25

- 移除一次性 `CODEX_TASK_*` 文件，避免和正式 tasks 文件重複。
- 移除獨立 `TASKS_MULTI_PAYEE_PAYMENT_SPLIT.md`，將多收款人付款拆分完整規格整合回 `TASKS_PENDING.md`。
- README、AI 入口與未來功能文件改指向正式 `TASKS_PENDING.md`。
- 同步版本、待辦與完成紀錄到 `0.2.43`。

## 0.2.42 - 2026-08-25

- 重新整理 README，改為目前狀態、已完成重點、主要待辦與文件入口。
- 重建亂碼文件：`TASKS_PENDING`、`AI_ENTRY_POINT`、`BUGS`、`DATABASE`、`API`、`ARCHITECTURE`、`SUPABASE_EMAIL_LOGIN`。
- 重建 `TASKS_MULTI_PAYEE_PAYMENT_SPLIT`，補齊多收款人付款拆分的資料結構、流程與驗收條件。
- 同步版本與文件狀態，讓完成項目留在 `TASKS_COMPLETED`，未完成項目留在 `TASKS_PENDING`。

## 0.2.41 - 2026-08-25

- 會計審核 modal 改為逐筆明細指定會計科目，並新增批次套用同一科目到全部明細。
- AI 科目建議支援針對單筆明細分析，避免多項目報支被整張單歸成同一科目。
- `/api/classify` 重寫為乾淨 UTF-8 規則，車馬、交通、住宿、旅費優先建議 `6110 差旅費`，雜項支出只作最低信心 fallback。
- 設定頁新增會計科目管理，可維護 `accounts` 代碼、名稱與類型。
- Supabase `accounts` policy 補齊 `super_admin` 寫入權限。
- 多收款人拆分付款需要新增付款明細/付款批次資料結構，已列入待辦。

## 0.2.40 - 2026-08-25

- 付款人欄位改為只輸入身分證/統編，輸入 8 碼以上會自動查詢並帶出中間為 `O` 的遮罩姓名。
- 新增 `lookup_masked_payee_by_identifier` RPC，精準查詢付款人並只回傳 `masked_name`，不回完整姓名、銀行或聯絡資料。
- 報支建立與退件補送送出時會檢查付款人姓名是否已帶出，避免查無或查詢中資料送出。
- 代付人欄位同步改為身分證/統編查詢遮罩姓名。

## 0.2.39 - 2026-08-25

- 報支建立與退件補送表單的付款人欄位改為姓名/公司名稱與身分證/統編手動填寫，不再向一般員工或主管顯示完整付款人名單。
- 一般使用者送出報支時不再要求先查到 `payees` 主檔，避免因個資保護造成「請選擇付款人」流程卡住。
- `payees` 與 `payment_recipients` RLS 已改為只有 `accounting`、`admin`、`super_admin` 可讀寫。
- 付款人主檔新增 modal 保留給會計與管理端，非財務角色會被提示直接填寫報支欄位。

## 0.2.38 - 2026-08-25

- 部門管理新增刪除按鈕與關聯檢查；若仍有子部門、使用者、專案、部門預算、預算申請或憑證綁定，會先阻擋刪除。
- 移除設定頁舊的本機「使用者核准」與未接正式流程的「匯出交易 JSON」區塊。
- 事業項目與董監名單新增可編輯表格，支援新增、修改、刪除並儲存到 Supabase。
- 董監名單儲存後會用出資合計同步 `company_settings.capital_cash`，讓已投入股本與財報來源一致。
- 密碼設定補上送出鎖、欄位最小長度、autocomplete 與成功後清空表單。
- Supabase company/department policy 對齊 `admin` / `super_admin` / `accounting` 管理權限。

## 0.2.37 - 2026-08-25

- 預算管理新增 Audit Trail：部門預算申請送出、更新、核准、退件，以及部門預算建立、調整、刪除都會寫入 `audit_logs`。
- Audit Trail 畫面合併顯示 `voucher_workflow_logs` 與預算相關 `audit_logs`，並新增預算動作篩選。
- `api/invite.js` 與 `api/reset-password.js` 改支援 `SUPABASE_SECRET_KEY`，保留 `SUPABASE_SERVICE_ROLE_KEY` 相容。
- Serverless API 會拒絕 `sb_publishable_`、`sb_anon_`，並檢查舊版 JWT key 的 `role` 必須是 `service_role`，讓 Vercel 環境變數錯誤更容易定位。
- 邀請與重設密碼 API 允許 `admin` / `super_admin` 操作。

## 0.2.36 - 2026-08-25

- Supabase 新增資料表 RLS 改用 `(select auth.uid())` / `(select public.get_my_role())` / `(select public.get_my_department())` 型式，減少逐 row 重算。
- 新增資料表補齊 FK index，並拆分重疊的 `FOR ALL` policy，清除本輪新增表的 performance advisor 警告。
- 收窄近期新增 SECURITY DEFINER helper 的 `public` / `anon` execute 權限，保留登入後需要的 RPC 並由函式內做角色檢查。
- `create_payroll_payment_batch` 改用 `public.get_my_role()` 判斷角色。
- Dashboard CSS 改用既有色彩 token，並補齊 1024 / 768 / 390 viewport 規則。
- 文件同步 `DATABASE`、`RLS_GUIDE`、待辦與完成紀錄。

## 0.2.35 - 2026-08-25

- 付款人主檔新增「明細」查詢，可看到付款日期、付款憑證、會計憑證、出款銀行與金額。
- 付款管理新增「員工薪資付款」批次功能，可勾選多位付款人並輸入薪資、勞保、健保、勞退。
- 薪資批次會以員工實領金額建立付款憑證，實領 = 薪資 - 勞保 - 健保；勞退不扣員工實領，另彙總到 24616337-3。
- 勞保、健保、勞退彙總分別對應 24616337-1、24616337-2、24616337-3，並建立批次紀錄供查帳。

## 0.2.34 - 2026-08-25

- 付款管理「所有付款人」改讀 Supabase `payees` detail，並同步付款作業所需的 `payment_recipients`。
- 會計憑證與付款憑證新增純流水號欄位，保留原有 `ACC-*` / `PAY-*` 顯示號碼。
- 部門預算申請新增項目明細，送出時驗證明細合計等於申請總額。
- 憑證中心新增專案篩選、全部專案與日期區間篩選。
- `docs/SUPABASE_EMAIL_LOGIN.md` 補充 Supabase Auth Admin API、Google SMTP 與 Firebase 取捨。

## 0.2.33 - 2026-08-25

- 新增 `department_budget_requests`，部門預算改為申請、審核、核准後寫入期初編列。
- 預算管理畫面新增預算申請審核清單，會計/Admin 可核准或退件。
- 部門年度預算摘要改顯示期初編列、實際使用、剩餘與部門成員人數。
- 專案卡片新增成員數 badge，保留既有專案成員管理流程。

## 0.2.32 - 2026-08-25

- 交易清單補齊銀行帳戶顯示，改用 `bank_transactions.bank_account_id` 關聯的銀行暱稱/銀行名與帳號。
- 新增「刪除全部無憑證」按鈕；0.2.56 起可清除所有未關聯 voucher 的手動交易，包含系統產生 `TX-...` 單號的交易。

## 0.2.31 - 2026-08-25

- 付款管理拆出「準備付款」與「所有付款人」，會計可新增、編輯、維護完整付款人銀行資料。
- 專案管理新增預設出款銀行，僅會計與 Admin 可見，付款時會自動帶入但仍可覆寫。
- 憑證中心改查報支單與付款憑證，非會計使用者只能查詢自己的申請、會計、付款憑證。
- 新增部門年度預算資料表與管理入口，非專案報支需選部門年度預算。
- 報支新增申請憑證 `REQ-*`、會計核准新增會計憑證 `ACC-*`、付款維持付款憑證 `PAY-*`，三段依序生成。
- 新增 `docs/SUPABASE_EMAIL_LOGIN.md`，記錄 Supabase Auth 正式寄信需設定自有 SMTP。

## 0.2.30 - 2026-08-25

- TASK-011 開始拆分 navigation，新增 `src/modules/navigation/navigation.js`。
- 將 `renderHeader()` 與 `renderTabs()` 從 `scripts/ui.js` 移出，保留 tab click 業務 callback 於原流程。
- 修正登入頁在窄 viewport 下卡片可能被內文最小寬度撐開的問題。
- 本機 HTTP smoke 確認首頁、`scripts/ui.js` 與 navigation module 可正常載入。
- 使用 Chrome headless 產生四種登入頁 viewport 截圖；登入後 Dashboard/財報完整互動驗收仍待有效帳號與 production 部署。

## 0.2.29 - 2026-08-25

- 完成 P1 未引用程式清理，移除未接入 runtime 的破損/空殼模組。
- 移除 `src/modules/core/app.js` 與 `src/modules/reports/financialReports.js`，避免 AI 或開發者誤接破損舊入口。
- 移除 0 byte 的 `src/services/auth/*` 與 `src/services/data/*` 空殼檔案。
- 文件同步正式財報路徑：`scripts/ui.js` 負責 UI 協調，`scripts/reports.js` 負責報表計算。
- 管理員重設密碼改走 Supabase Auth Admin API，修正重新登入時新密碼被判定錯誤的問題。

## 0.2.28 - 2026-08-21

- 報支明細改為選擇付款人，並由 Supabase 自動連結至付款管理。
- 付款管理可在付款前再次確認及即時修改收款銀行、分行、戶名與帳號。
- 實際付款時產生獨立 `PAY-日期-流水號` 付款憑證，與交易管理憑證分離。
- 交易管理新增資料改為直接寫入 Supabase，不再使用 localStorage 作為財務資料來源。
- 移除程式內硬編碼公司範例；公司、交易及付款人資料只從 Supabase 載入。

## 0.2.27 - 2026-08-21

- 將會計核准與實際付款拆成兩個階段，付款後才產生日記帳、銀行流水與付款憑證。
- 新增會計／管理員專用付款清單，支援待付款、已付款、付款前編輯與 Excel 匯出。
- 新增受限的收款人銀行資訊設定，只有會計與管理員可以查看及維護。
- 付款完成後通知申請人與該專案成員。
- 交易清單改讀 Supabase `bank_transactions`，修正 1,000 元流水未顯示及銀行名稱錯誤。
- 帳號管理先合併角色預設權限與個別設定，再顯示目前勾選狀態。
- 邀請 API 改用專用 caller-role RPC，不再透過 profiles RLS 判定管理員。

## 0.2.26 - 2026-08-21

- 四大財報改為四張獨立 A4 頁面，支援列印本頁或一次列印四份並自動換頁。
- 銷帳改用單一 Supabase transaction，沿用既有 journal entry 並提供可重試的冪等行為。
- 自動補齊舊銷帳流程留下的缺漏付款紀錄。
- 修正 profile 稽核 trigger 誤讀不存在的 `allowed_features`，統一使用 `permissions`。
- 修正邀請帳號時 `get_my_department` 的執行權限，profile 建立改為安全 upsert。

## 0.2.25 - 2026-08-21

- 四大財報改為置中公司抬頭，補上統編、幣別與製表日期。
- 修正已投入股本被放在錯誤流程，資產負債表與權益報表重新納入股本。
- Audit Trail 改用專案原生 CSS 表格，移除會放大成整頁的圖示。
- 桌面版左側導覽新增收合控制，並保留手機版既有選單行為。
- 銀行帳戶新增會計科目綁定，既有 9 個帳戶補綁 `1102 銀行存款`。
- 部門管理新增上層部門，可建立部門下的組別並顯示完整路徑。
- 修正核准流程查詢不存在的 `invoices.created_at` 欄位。

## 0.2.24 - 2026-08-21

- 修正專案成員 modal 被插入頁面內容流、切頁後留下大面積白色遮罩。
- 專案建立、成員編輯、專案選單與報支重送統一使用 `project_members`。
- 登入狀態補齊 `permissions` 與部門資料，自訂功能授權會實際套用。
- 合併帳號與權限管理，每位使用者改為獨立完整列並支援已開通帳號編輯。
- 公司基本資料、營業項目與董監股東改由 Supabase 儲存並套用 RLS。
- 以股東出資額作為已投入股本，補入資產負債表、權益變動表與試算表。
- 匯入原始金流 Excel 的 21 筆歷史銀行流水，保留既有資料並防止重複匯入。
- 一般使用者的設定頁改為密碼優先、公司資料唯讀，隱藏系統管理區塊。

## 0.2.23 - 2026-08-21

- 修正報支申請清單的「查看歷程」按鈕重複。
- 已銷帳單據新增會計／管理員專用銷案操作，原因為必填。
- 新增 `void_closed_voucher` Supabase RPC，原子性處理狀態、預算、財務影響與稽核紀錄。
- 會計科目下拉選單統一使用 `fetchAccounts()`，不再吞掉查詢錯誤。
- 對審批原因進行 HTML escape，避免稽核內容被解析為標記。

## 0.2.22 - 2026-08-21

- 將兩個分岔的本機副本合併至 `表格自動化\netlify`。
- 保留第 1 份較新的權限、Auth Provider、Repository、交易與傳票模組。
- 合併第 2 份已完成的 Dashboard、CSS、API、銀行、報表與文件修正。
- 修正帳號管理 renderer 命名衝突，版本顯示改為讀取 `APP_VERSION`。
- 移除合併後殘留的 Netlify Identity 與硬編碼 `Demo v2.9.12`。

## 0.2.21 - 2026-08-21

- 修正 Dashboard 使用未載入 Tailwind class 導致 production 跑版。
- 重建 Dashboard 為語意化 HTML 與專案內建 CSS。
- 新增 1440、1024、768、390 viewport 響應式規則。
- 修正 header 漢堡按鈕缺少標籤及 header 內容層級。
- 移除 `netlify.toml`、舊 Identity 死碼與平台文案。
- 將 localStorage key 改為 Vercel 命名。
- 全部 docs、README、CHANGELOG 重建為 UTF-8 繁體中文。
- 核對 GitHub、Vercel 與 Supabase 實際狀態。

## 0.2.20 - 2026-08-21

- 同步完成工作、待辦工作與未來功能清單。
- 更新版本、AI 入口、問題紀錄與文件索引。

## 0.2.19 - 2026-08-21

- 套用 Supabase FK covering indexes。
- 補上附件 Storage authenticated update policy。
- 重新執行 Supabase advisors。

## 0.2.18 - 2026-08-21

- 建立銀行帳戶與總帳科目契約。
- 加入銀行勾稽狀態與正式財報資料來源限制。
- 加入 voucher 高風險寫入唯一索引。
- 強化邀請 API、專案成員回讀及財報列印模式。

## 0.2.17 - 2026-08-21

- 修正帳號管理 renderer 重複宣告。
- 新增事件初始化 guard 與建立帳號 action lock。



