# 變更紀錄

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
- 新增「刪除全部無憑證」按鈕，可一次清除未關聯憑證且沒有交易憑證號的銀行交易。

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

