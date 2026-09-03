# 變更紀錄

## 0.2.73 - 2026-09-03

- Added and directly applied Supabase RPC `delete_voucher_cascade` for voucher deletion, including related voucher lines, invoices, payments, workflow logs, bank transactions, manual transactions, and journal entries.
- Updated `deleteVoucher()` to call `delete_voucher_cascade` instead of deleting related records in separate frontend steps.
- Added centralized Storage attachment cleanup after the database delete; Storage failure is reported as a warning instead of leaving database rows half-deleted.
- Updated Supabase RPC `update_voucher_with_details` so rejected voucher resubmission writes status and workflow log in the same database transaction.
- Removed the frontend manual workflow-log insert from full resubmission.

## 0.2.72 - 2026-09-03

- 交易入帳表單補借方/貸方說明與即時摘要，收入預設為借記銀行、貸記收入科目，支出預設為借記費用/成本、貸記銀行，仍可手動調整 debit/credit。
- 一般員工輸入身分證/統編查無付款人時可穩定開啟新增付款人 modal；代付人查無也提供新增入口，但不開放完整付款人主檔名單。
- 付款人新增 modal 改為只關閉自己的視窗，避免誤關其他 modal；新增成功後正確回填付款人或代付人遮罩姓名。
- 付款人付款明細 modal 改用不透明專用樣式與固定白色卡片，改善透明看不清楚與按鈕不好點問題。
- 銀行帳戶卡片排版改為主資訊/餘額/帳號明細/操作分區，長帳號可換行，桌機與手機都不擠壓。

## 0.2.71 - 2026-09-03

- 依使用者指示，Supabase schema/RPC 已直接套用到 project `imlmclalgbfxhhnpsyam`，不再只等待 GitHub migrations。
- 遠端清理 2 組未核銷、未配對的重複銀行流水，並建立 `bank_statement_transactions_dedupe_key` 唯一索引。
- 遠端套用 vouchers manager update scope、`profiles.role` `super_admin` constraint、報支新增/修改 RPC、會計審核/付款 RPC、主管審核/重送 RPC。
- 新增 `20260903090000_restrict_atomic_voucher_rpc_anon_execute.sql`，記錄遠端已收斂 atomic voucher RPC 的 `anon` execute 權限。
- 驗證遠端：重複銀行流水 0 組、8 支 atomic voucher RPC 存在，皆為 `SECURITY INVOKER`，`authenticated` 可執行、`anon` 不可執行。

## 0.2.70 - 2026-09-03

- 新增 `20260831104000_atomic_voucher_review_payment_rpc.sql`，會計明細歸類、付款人/備註設定與會計核准同一交易完成。
- 新增 `20260831105000_atomic_manager_review_rpc.sql`，主管核准、主管退件與重送狀態、workflow log 同一交易完成。
- 付款設定改走 `save_voucher_payment_assignment` RPC。
- 會計審核送出改一次呼叫 `accountingApprove(voucher, options)`，不再先逐筆 update `voucher_lines` 再 update `vouchers`。

## 0.2.69 - 2026-08-31

- 新增 `20260831103000_atomic_voucher_details_rpc.sql`，建立 atomic voucher 新增與修改 RPC。
- 報支新增改走 `create_voucher_with_details`，主檔、明細、發票與送出流程紀錄同一交易完成。
- 報支修改改走 `update_voucher_with_details`，主檔、明細、發票與部門/專案預算 scope 同步更新。

## 0.2.68 - 2026-08-31

- 補回遠端已套用但本機缺失的 `20260831022735_consolidate_duplicate_permissive_policies.sql`，避免 migration history 與 repository 不一致。
- 新增 `20260831101000_restrict_voucher_manager_update_scope.sql`，移除 `vouchers role update` 對全體 manager 的跨部門更新放行。
- 新增 `20260831102000_allow_super_admin_profile_role.sql`，讓 `profiles.role` check constraint 支援 `super_admin`。
- 重建 `docs/RLS_GUIDE.md` 為乾淨 UTF-8，補上角色權限、vouchers policy 與驗收規則。
- `docs/ARCHITECTURE.md` 補 module rule：新功能優先放 `src/modules/`，`scripts/` 只保留入口與尚未遷移的舊邏輯。

## 0.2.67 - 2026-08-31

- 銀行對帳單確認匯入前會先查詢同銀行帳戶、日期區間內既有資料，重複資料會跳過，不再每次按匯入都新增同一批明細。
- 新增 `20260831100000_bank_statement_import_dedupe_index.sql`，以銀行帳戶、銀行代碼、日期、摘要、對象、收入、支出與餘額建立唯一索引防線。
- 匯入成功訊息會顯示實際新增筆數與跳過重複筆數，避免誤以為所有解析資料都有新增。

## 0.2.66 - 2026-08-31

- 移除 `scripts/ui.js` 內舊 `addTransactionForm` submit handler，避免任何交易表單繞過正式 RPC 只寫入 `bank_transactions`。
- 重建 `src/modules/bank/bankAccounts.js` 為乾淨 UTF-8，舊 `setupTransactionForm()` 改為 deprecated guard，不再直接寫銀行流水。
- 重建 `src/modules/transaction/transactionUI.js` 為 deprecated facade，防止未來誤 import 舊交易 UI 後產生銀行流水、交易表、日記帳不同步。

## 0.2.65 - 2026-08-31

- `/api/parse-bank-statement` 的銀行 parser key 改用 ASCII-safe Unicode escape，避免檔案編碼損壞後 `玉山187`、`兆豐347/703/182/697` 等 bankCode 對不上。
- 保留 `pdf-parse` lazy require；缺少 `fileBase64` 或 `bankCode` 仍會先回 400，不會在 cold start 階段直接 500。
- 部署動作依使用者指示保留手動執行；本機只完成程式與文件更新。

## 0.2.64 - 2026-08-31

- 修正 `.gitignore`，移除 `/docs/` 忽略規則，讓任務、版本、API、資料庫與交接文件能上傳到 GitHub。
- 重建 `.gitignore` 可讀規則，保留 dependency、env、平台 metadata 與 smoke-test 暫存輸出忽略。
- README 補上 GitHub 上傳清單與不要上傳的本機/secret 檔案清單。

## 0.2.63 - 2026-08-31

- 補上 `pdf-parse` dependency，修正 Vercel production `/api/parse-bank-statement` 找不到 module 造成 500。
- `/api/parse-bank-statement` 改為在驗證 `fileBase64` 與 `bankCode` 後才載入 PDF parser，缺參數會正確回 400。

## 0.2.62 - 2026-08-31

- 新增 `api/_supabaseServer.js`，集中 server-side Supabase admin key 檢查、登入驗證與角色檢查。
- 重寫 `/api/invite`、`/api/reset-password`、`/api/notify-payee`、`/api/scan-receipt`、`/api/classify` 與 `/api/parse-bank-statement` 的壞碼訊息。
- `/api/notify-payee` 補後端角色限制，只有 `admin`、`super_admin`、`accounting` 可寄付款通知。
- `/api/classify` 明確要求 AI 選最接近會計科目，低信心才標記人工確認，不再把常見項目預設丟到雜項支出。
- 前端 `inviteNewUser()` 修復壞掉的錯誤字串與 JSON 解析 fallback。

## 0.2.61 - 2026-08-28

- 付款通知、AI 憑證掃描與 AI 科目分類 API 改為優先使用 `SUPABASE_SECRET_KEY`，並保留 `SUPABASE_SERVICE_ROLE_KEY` 相容。
- 三支 server API 補 admin key 類型檢查，避免誤把 publishable/anon key 當作 server-side key。
- 透過 Vercel MCP 確認 `financialsystem` project production deployment 為 `READY`。

## 0.2.60 - 2026-08-28

- 整理 `docs/TASKS_PENDING.md`，移除重複 P0 區塊與已完成項目。
- 新增 `TASK-017：獨立收入管理流程`，記錄正式收入申請、應收帳款與發票收入流程尚未建立。

## 0.2.59 - 2026-08-28

- 修正 `scripts/main.js` 啟動錯誤處理字串，避免入口檔語法錯誤導致 `scripts/ui.js` 無法載入。
- 將未被 production 入口使用且已亂碼的 `src/modules/voucher/voucherForm.js` 改為 deprecated guard module。
- 已用本機 HTTP server 與 Chrome headless 截圖驗證登入頁可載入。

## 0.2.58 - 2026-08-28

- `create_payee_from_identifier` 補強既有付款人處理：身份證/統編已存在時，只回傳既有預設收款帳戶。
- 新付款人仍可在新增時同步建立 `payment_recipients`，保留付款管理可帶入銀行資料的流程。
- 已用 rollback 測試確認新付款人會產生收款帳戶，既有付款人不會被注入新的銀行帳戶。
- 已用測試收入單確認 `create_manual_bank_transaction_entry` 會同步寫入 `bank_transactions`、`transactions`、`journal_entries`。

## 0.2.57 - 2026-08-28

- 付款人新增 modal 補「銀行名稱」欄位。
- `create_payee_from_identifier` 改為新增付款人後同步建立 `payment_recipients` 預設收款帳戶。

## 0.2.56 - 2026-08-28

- 交易管理新增「交易入帳」表單，會計/管理員可直接建立收入或支出，並指定借方與貸方會計科目。
- 新增 Supabase RPC `create_manual_bank_transaction_entry`，手動交易會同步寫入銀行流水、交易表與日記帳。
- 新增 Supabase RPC `delete_manual_bank_transaction_entry`，刪除手動交易時會同步清除銀行流水、交易表與日記帳。
- 交易清單新增借方/貸方欄位，收入可直接進 `4xxx` 收入科目。
- 一般員工輸入身分證/統編查無付款人時，可受控新增該筆付款人；仍不開放完整付款人名單。
- 銀行帳戶頁改為卡片式排版，並補強付款人明細 modal 的實底背景與點擊可用性。
- 收斂付款人、收款帳戶、銀行流水、交易表、日記帳與銀行帳戶 grants。

## 0.2.55 - 2026-08-27

- 修正付款銷帳 RPC：有 `voucher_lines.account_code` 時，`journal_entries` 依明細科目與金額逐科目入帳。
- 移除 `journal_entries_one_per_voucher` 唯一索引，允許同一張 voucher 產生多筆分錄。
- 已修復 `VOU-20260825-5269`：分錄為 `6110 差旅費 2,000`、`6230 雜項支出 20,000`。

## 0.2.54 - 2026-08-27

- 新增 `/api/public-config` 與 `.env.example`，前端 Supabase URL / anon key 改以 Vercel env 為正式來源。
- 重寫 `/api/invite` 可讀訊息；Supabase Auth invite 現在回報「邀請請求已交給 Supabase」。
- `journal_entries` 財報核心查詢與 journal 明細改為 `.range()` 分頁，避免超過 1000 筆後漏資料。
- 通知鈴鐺新增 Supabase Realtime 訂閱 `public.notifications`，保留 30 秒輪詢備援。
- 新增 `payroll_agency_mappings`，薪資勞保/健保/勞退代收統編改由資料表設定。
- 修正 `close_voucher_by_accounting`、`create_payroll_payment_batch` 角色判斷回歸。
- 新增 migration lint，防止新 migration 再直接查 `profiles.role`。

## 0.2.53 - 2026-08-27

- 付款設定新增「付款項目」區塊，列出明細筆數、每筆摘要、原填收款人、金額與科目。
- 「更換本筆付款人」新增搜尋框，可用姓名、身分證/統編、銀行、戶名或帳號篩選。

## 0.2.52 - 2026-08-27

- 付款設定可依原始付款人帶入同一付款人的多個收款帳戶。
- 「所有付款人」列表的銀行資料欄改為列出該付款人的全部 `payment_recipients` 帳戶。
- 新增 migration，移除 `payment_recipients(payee_id)` 唯一限制。

## 0.2.51 - 2026-08-27

- 付款設定改為固定確認既有付款金額、收款人與收款帳戶。
- 新增「更換本筆付款人」區塊；只有收款人錯誤時才更新該張 voucher 的付款人。
- `savePaymentAssignment()` 不再更新 `payment_recipients` 銀行帳號主檔。

## 0.2.50 - 2026-08-27

- 透過 Supabase Auth logs 確認官方 invite 信件 500 根因：SMTP host 被填成網站 URL。
- `docs/SUPABASE_EMAIL_LOGIN.md` 補上 SMTP Settings 正確欄位格式、Dashboard 修正位置與 Management API 修正方式。
- 新增 `scripts/tools/update-supabase-smtp.ps1`，可用 Supabase Personal Access Token 從本機更新 Auth SMTP config。

## 0.2.49 - 2026-08-27

- 付款設定移除會計科目下拉，付款階段不再重新選科目。
- 付款設定改為唯讀顯示會計審核階段已指定的每筆 `voucher_lines.account_code`。
- 會計備註會依付款日期自動帶入 `MMDD_摘要`，例如 `0827_XXX`。

## 0.2.48 - 2026-08-27

- 付款設定改為先建立 modal，再背景載入付款人、會計科目與公司銀行帳戶。
- 付款設定資料載入加入 12 秒逾時提示。
- 補上 `.modal-backdrop` 全域樣式，確保付款 modal 以 fixed overlay 顯示。

## 0.2.47 - 2026-08-27

- 付款清單操作按鈕改用 `data-payment-action` 與 `paymentList` click 事件代理。
- 按「付款設定／確認付款」時會進入「開啟中...」狀態。

## 0.2.46 - 2026-08-25

- 付款管理開啟付款設定時加入錯誤提示。
- 付款設定視窗補上付款人與付款銀行缺資料提示。
- 文件補充付款清單正確操作方式。

## 0.2.45 - 2026-08-25

- 付款清單移除容易誤解的 checkbox，改以狀態 badge 顯示「待處理／已完成」。
- 待付款操作按鈕改為「付款設定／確認付款」。
- 確認付款前先檢查收款人、收款銀行、會計科目、付款銀行與付款日期。
- Supabase `close_voucher_by_accounting` RPC 補允許 `super_admin` 執行付款銷案。

## 0.2.44 - 2026-08-25

- `/api/invite` 新增 Supabase 官方邀請信模式。
- 帳號邀請成功訊息依 `emailProvider` 顯示 Supabase 邀請或 Gmail 初始密碼流程。

## 0.2.43 - 2026-08-25

- 移除一次性 `CODEX_TASK_*` 文件，避免和正式 tasks 文件重複。
- 移除獨立 `TASKS_MULTI_PAYEE_PAYMENT_SPLIT.md`，將多收款人付款拆分規格整合回 `TASKS_PENDING.md`。

## 0.2.42 - 2026-08-25

- 重新整理 README，改為目前狀態、已完成重點、主要待辦與文件入口。
- 重建亂碼文件：`TASKS_PENDING`、`AI_ENTRY_POINT`、`BUGS`、`DATABASE`、`API`、`ARCHITECTURE`、`SUPABASE_EMAIL_LOGIN`。
- 同步版本與文件狀態。

## 0.2.41 - 2026-08-25

- 會計審核 modal 改為逐筆明細指定會計科目。
- AI 科目建議支援針對單筆明細分析，避免多項目報支被整張單歸成同一科目。
- 設定頁新增會計科目管理，可維護 `accounts` 代碼、名稱與類型。

## 0.2.40 - 2026-08-25

- 付款人欄位改為只輸入身分證/統編，輸入 8 碼以上會自動查詢並帶出中間為 `O` 的遮罩姓名。
- 新增 `lookup_masked_payee_by_identifier` RPC。

## 0.2.39 - 2026-08-25

- 報支建立與退件補送表單的付款人欄位改為姓名/公司名稱與身分證/統編手動填寫。
- `payees` 與 `payment_recipients` RLS 已改為只有 `accounting`、`admin`、`super_admin` 可讀寫。

## 0.2.38 - 2026-08-25

- 部門管理新增刪除按鈕與關聯檢查。
- 移除設定頁舊的本機「使用者核准」與未接正式流程的「匯出交易 JSON」區塊。
- 事業項目與董監名單新增可編輯表格並儲存到 Supabase。
- 密碼設定補上送出鎖、欄位最小長度、autocomplete 與成功後清空表單。

## 0.2.37 - 2026-08-25

- 預算管理新增 Audit Trail。
- `api/invite.js` 與 `api/reset-password.js` 改支援 `SUPABASE_SECRET_KEY`。
- 邀請與重設密碼 API 允許 `admin` / `super_admin` 操作。

## 0.2.36 - 2026-08-25

- Supabase 新增資料表 RLS、FK index 與 policy advisor 清理。
- `create_payroll_payment_batch` 改用 `public.get_my_role()` 判斷角色。
- Dashboard CSS 補齊 1024 / 768 / 390 viewport 規則。

## 0.2.35 - 2026-08-25

- 付款人主檔新增「明細」查詢。
- 付款管理新增「員工薪資付款」批次功能。
- 薪資批次支援薪資、勞保、健保、勞退與實領計算。

## 0.2.34 - 2026-08-25

- 付款管理「所有付款人」改讀 Supabase `payees` detail。
- 會計憑證與付款憑證新增純流水號欄位。
- 部門預算申請新增項目明細。
- 憑證中心新增專案篩選、全部專案與日期區間篩選。

## 0.2.33 - 2026-08-25

- 預算管理改為申請、審核流程。
- 部門年度預算摘要改顯示期初編列、實際使用、剩餘與部門成員人數。
- 專案卡片新增成員數 badge。

## 0.2.32 - 2026-08-25

- 交易清單補齊銀行帳戶顯示。
- 新增「刪除全部無憑證」按鈕。

## 0.2.31 - 2026-08-25

- 付款管理拆出「準備付款」與「所有付款人」。
- 專案管理新增預設出款銀行。
- 憑證中心改查報支單與付款憑證，非會計使用者只能查詢自己的資料。
- 新增部門年度預算資料表與管理入口。
- 報支新增申請憑證 `REQ-*`、會計核准新增會計憑證 `ACC-*`、付款維持付款憑證 `PAY-*`。

## 0.2.30 - 2026-08-25

- 拆分 navigation，新增 `src/modules/navigation/navigation.js`。
- 修正登入頁在窄 viewport 下卡片可能被內文最小寬度撐開的問題。
- 本機 HTTP smoke 確認首頁、`scripts/ui.js` 與 navigation module 可正常載入。

## 0.2.29 - 2026-08-25

- 完成 P1 未引用程式清理。
- 移除未被 runtime import 且內容破損的舊模組。
- 管理員重設密碼改走 Supabase Auth Admin API。

## 0.2.28 - 2026-08-21

- 報支付款人串聯至付款管理。
- 付款管理可即時確認及修改收款銀行、分行、戶名與帳號。
- 實際付款時產生獨立 `PAY-日期-流水號` 付款憑證。
- 交易管理新增資料改為直接寫入 Supabase。

## 0.2.27 - 2026-08-21

- 將會計核准與實際付款拆成兩個階段。
- 新增會計／管理員專用付款清單。
- 新增受限的收款人銀行資訊設定。
- 交易清單改讀 Supabase `bank_transactions`。

## 0.2.26 - 2026-08-21

- 四大財報改為四張獨立 A4 頁面。
- 銷帳改用單一 Supabase transaction。
- 修正 profile 稽核 trigger 與邀請帳號權限問題。

## 0.2.25 - 2026-08-21

- 四大財報新增公司抬頭。
- 修正已投入股本來源。
- Audit Trail 改用專案原生 CSS 表格。
- 銀行帳戶新增會計科目綁定。
- 部門管理新增上層部門。

## 0.2.24 - 2026-08-21

- 修正專案成員 modal 與切頁遮罩問題。
- 專案建立、成員編輯、專案選單與報支重送統一使用 `project_members`。
- 公司基本資料、營業項目與董監股東改由 Supabase 儲存。
- 一般使用者設定頁改為密碼優先與公司資料唯讀。

## 0.2.23 - 2026-08-21

- 修正報支申請清單的「查看歷程」按鈕重複。
- 已銷帳單據新增會計／管理員專用銷案操作。
- 新增 `void_closed_voucher` Supabase RPC。
- 修正會計科目下拉選單載入與錯誤提示。

## 0.2.22 - 2026-08-21

- 合併兩個本機分岔副本，統一正式目錄與版本來源。
- 修正帳號管理 renderer 命名衝突。
- 移除 Netlify Identity 與硬編碼 demo 版本。

## 0.2.21 - 2026-08-21

- 修正 Dashboard production 跑版。
- 新增多 viewport 響應式規則。
- 移除 Netlify 舊內容。
- 重建繁中文件並核對 GitHub、Vercel 與 Supabase 狀態。

## 0.2.20 - 2026-08-21

- 同步完成工作、待辦工作與未來功能清單。

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
