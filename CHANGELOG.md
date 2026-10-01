# 變更紀錄

## 0.6.24 - 2026-10-01

- 遠端套用 20261001101941_company_financial_scope：48 張業務表 company_id／NOT NULL／default／restrictive RLS／不可搬移公司 guard；回填既有資料至 legacy 公司，增加 140 個業務與會員同公司 FK，會員部門另有同公司 FK。公司內唯一鍵與單例主鍵涵蓋科目、憑證／付款／AR 編號、會計期間、匯率、公司設定等。
- 70 個 public 財務 definer 函式改由 NOLOGIN／NOBYPASSRLS financial_rpc 擁有，API 角色不能繼承／切換成該 owner；只繼承 ordinary authenticated schema/function 權限，沒有 service_role 權限，表 owner 仍 postgres。RPC 仍保持單次原子交易。
- get_my_role／get_my_department 改讀公司會員；主管／會計路由改讀 private 的公司資格 view。直接 profile 查詢加公司限制，共用身分的全域權限變更受阻。單公司舊前端在無公司 header 時保留經會員資格核對的 legacy bridge；明確錯誤 header 不退回 legacy。
- 回滾 SQL 通過两公司全部 48 表讀取／錯誤 header、view、跨公司科目／銀行／會員 FK、RPC 建立／刪除、全表名單替換、公司內 employee 無法借全域 admin 權限。手動交易的交易／流水／分錄／audit 同公司同步。
- 既有手動交易、AR 收款、拆分付款、開帳／反轉、期間、通知、IFRS、期末 FX、付款人／銀行、專案會員、帳單匯入、停用角色、公司會員、薪資回滾驗證通過；套用後再測租戶、交易、AR、通知及薪資。fixtures=0／ready=0，原營業項目 3 筆保留，遠端 161、本機 127 migration。
- 前端公司設定與匯率 upsert 改用公司唯一鍵，四組 Chrome 回歸及 migration lint 通過。Security advisor 兩項無 policy 提示已消失；48 個 intentional authenticated definer 及未開啟外洩密碼保護提示仍在。
- 前端未部署，公司切換仍暫禁。Storage、帳號 API、公司配置與前端有效角色／header 切換、全新資料完整流程與輪換發版仍未完成，v1.0.0 保守驗收估計約 35%，不宣稱正式多公司上線。

## 0.6.23 - 2026-10-01

- 補上 companies／company_memberships／company_access_audit 公司會員基礎。既有 5 個 profile 回填至同一 legacy 公司，舊邀請／角色／停用異動同步會員；帳務表與 get_my_role 尚未切換到公司範圍。
- 公司建立與會員管理使用單一 RPC，稽核 trigger 與寫入同交易；建立 request ID 防重，最後管理員檢查使用公司列鎖。RLS 以公司內角色控制會員／audit 讀取，直接寫入與匿名權限撤銷。
- 遠端 migration 20261001094936 已套用。兩家公司回滾測試、跨公司／停用拒絕、公司內角色優先於全域角色、稽核失敗回滾、建立防重通過。兩個獨立連線同時停用管理員：一成功、一拒絕，DB 保留一位有效管理員；fixture／test trigger 殘留 0。
- 前端公司清單與資格查詢改讀 RPC，不再無條件放行。公司切換仍明確禁止；ready 公司數為 0，避免尚未隔離的帳務資料混用。companyAccess／companyStructure／companyCapital 瀏覽器回歸與 migration lint 通過；前端未部署。
- 本批是多公司遷移的會員階段，完整帳務隔離、跨公司 FK／RPC／Storage、全新端到端帳務、憑證輪換與部署仍未完成。v1.0.0 保守驗收估計維持 30%，完整範圍未縮減。

## 0.6.22 - 2026-10-01

- 補實際匿名加密 PDF 測試，修正 pdfplumber 0.11.7 包裝密碼例外造成漏判，現在明確回 422 encrypted_pdf，不回傳例外內容。
- 正確合成密碼可開啟 PDF；未提供密碼時解析器與隔離 worker 均拒絕。3 MiB PDF 可解析、超過 1 byte 回 413；HTTP employee／manager／無啟用角色回 403。pytest 19 passed。
- 無資料庫異動，未部署。真實銀行版面、Supabase session、vercel dev／Preview 仍待驗收；台新三帳戶仍不支援，見 docs/BANK_STATEMENT_PARSER_V2.md。

## 0.6.21 - 2026-10-01

- 修正公司名單儲存先刪營業項目、再新增、再存董監的跨請求不一致風險。前端改為單一 save_company_structure RPC，DB 同交易替換兩份名單並寫兩筆 audit；只在完整成功回應後更新本機 state。
- 撤銷 authenticated 營業項目直接 INSERT／UPDATE／DELETE；新 RPC 與既有獨立董監 RPC 使用相同交易鎖，限制啟用 accounting／admin／super_admin，UI 明示檢視與修改角色，資本設定不隨名單變更。
- 遠端套用 20261001091719_company_structure_atomic。DB 回滾證明無效董監與最後 audit 失敗不留部分資料；employee／manager／缺 profile／未登入與直接寫入拒絕，並行呼叫測試通過。測試殘留 0；遠端 159、本機 125 migration。瀏覽器公司名單、資本、銀行解析回歸通過。前端未部署。
- 核對遠端 schema 發現並無 company_id／company membership，多公司切換為空殼。列為 v1.0.0 重大未完成項，不提升正式版完成度，見 docs/V1_ACCEPTANCE.md。

## 0.6.20 - 2026-10-01

- 新增 Python `GET/POST /api/parse_statement`，驗證 Supabase token 與既有 `get_my_role()`，僅限啟用 accounting／admin／super_admin。不儲存上傳檔案，不記錄解析文字，以隔離子程序限制 20 秒解析。
- 七個玉山／兆豐帳戶共用 profile，依表頭座標辨識收支／餘額，Decimal 驗證餘額與合計；方向不明、日期無效等列明示拒絕。台新三個帳戶回 400，等待去識別化樣本。
- 前端從 API 取得支援清單，選擇規則並核對系統帳戶；顯示警告、未解析列與勾選筆數，零金額跳過並回報，檔案／帳戶變更清除預覽，錯誤訊息加 HTML 跳脫。
- 舊 Node 端點回 410，移除 pdf-parse；新增 requirements、maxDuration 設定與私有樣本／部署排除。未更動資料庫與正式交易精確金額配對。
- 17 組 pytest、14 份合成座標 golden fixture 及瀏覽器預覽／匯入／新舊對照通過。加密錯誤與逾時為 mock；真實 PDF、實際 Supabase session、vercel dev 打包／路由、Preview 與 3 MB 冷啟動未驗證。見 `docs/BANK_STATEMENT_PARSER_V2.md`。

## 0.6.19 - 2026-10-01

- 報支流程通知改由資料庫 trigger 與憑證狀態同交易寫入，涵蓋送出、主管核准／退件、會計核准／退件及通知 audit。無有效財務收件人時整筆主管審核回滾。
- 移除前端重複通知入口與登入者直接新增通知權限，避免漏送或偽造流程通知。
- 四組資料庫回滾測試通過；遠端 158、本機 124 份 migration。前端尚未部署；依使用者指示停止 Vercel 工作。v1.0.0 驗收仍約 30%。

## 0.6.18 - 2026-10-01

- 修正停用主管仍可讀 29 個科目、公司設定與 9 則自己的通知，以及一般員工可讀 8 筆財報附註的權限缺口。科目、公司資料、幣別／匯率與部門參照表改需啟用 profile；財報附註改限會計／管理員／超級管理員。
- 遠端套用 `20261001044951_active_reference_and_notification_audit`：通知讀寫需啟用帳戶，收件人也需啟用；只能更新自己的 `is_read`，通知新增／更新／刪除同交易寫 audit。資料庫回滾測試通過啟用員工參照讀取、財報附註拒絕、通知新增／已讀 audit、內容篡改與停用寄件人／收件人拒絕。fixture 0。
- 遠端 migration 156、本機 122。憑證 RPC 後由前端另送通知仍非原子交易，列入後續必要修正。前端未部署，v1.0.0 保守完成度仍 30%。

## 0.6.17 - 2026-10-01

- 修正停用管理員即使 `get_my_role()` 已為空，仍可由不檢查啟用狀態的 RLS 讀到 5 筆專案成員、2 筆其他 profile、1 筆專案且可更新自己的 profile。`get_my_department()` 現在排除停用帳戶；主管／會計路由名單、同部門帳戶、專案成員、專案、交易、憑證及自身 profile 更新政策均加上啟用身分條件，保留停用者讀取自身狀態。
- 遠端套用 `20261001043515_inactive_profile_rls_boundaries`。資料庫回滾測試通過停用管理員／員工讀寫拒絕及啟用員工主管路由；帳號更新 audit、專案成員原子更新與主管簽核回歸通過，fixture 0。遠端 migration 155、本機 121。
- 其他未納入本批的 RLS 與 RPC 仍需逐項普查；前端未部署，v1.0.0 保守完成度維持 30%。

## 0.6.16 - 2026-10-01

- 回滾重現停用中的管理員仍可讀取 4 列專案費用：`get_my_role()` 只查角色，未檢查 `profiles.active`。該函式被 101 個 RLS policy 與 40 個函式引用。
- 遠端套用 `20261001042623_active_profile_role_guard`，共用角色判斷只回傳啟用帳戶的角色。資料庫回滾測試通過：啟用管理員仍可讀銀行／稽核／專案費用；停用或缺少 profile 者失去角色及這些存取。既有帳號更新 audit、專案費用淨額，以及 38 項缺身分／profile 和 4 項非財務角色 RPC 測試重新通過，fixture 0。
- 遠端 migration 154、本機 120；前端未部署。更多不依賴 `get_my_role()` 的政策與 RPC 仍需逐項普查，v1.0.0 保守完成度維持 30%。

## 0.6.15 - 2026-10-01

- 修正選擇全域專案時四大財報仍讀全公司總帳、畫面卻先篩前端交易且簽名只取該專案部門主管的語意不一致。四大財報及試算表明示全公司範圍，列印抬頭與 Excel 同步標示；專案費用仍由專用選單篩選。
- 報表抬頭的公司名稱與統編加上 HTML 轉義。前端實際函式測試通過全公司範圍、兩個不同部門的實名主管、轉義與 Excel 標示。
- 資料庫唯讀確認 journal_entries 與 bank_transactions 無 project_id；project_expense_report 經 voucher.project_id 彙總費用科目，現有資料回傳 4 列。無新增 migration、無資料庫寫入；前端未部署，v1.0.0 保守完成度維持 30%。

## 0.6.14 - 2026-10-01

- 日記帳移除資料庫失敗時改用前端交易資料重組的回退；錯誤明示且不顯示可能不完整的分錄。日記帳文字欄位輸出轉義。
- 總帳分錄科目不存在或借貸不平時停止產生財報；分頁查詢加上穩定 ID 排序、重複 ID 檢查。銀行勾稽讀取失敗時顯示無法取得／無法計算，不把未知數值顯示為 0。
- 遠端唯讀查核現有 5 筆總帳分錄，借／貸台幣基準金額各 904,200、缺漏科目均 0；前端實際函式測試通過資料庫錯誤、缺科目、借貸不平、重複 ID 及勾稽未知狀態。無新增 migration；前端未部署，v1.0.0 保守完成度仍 30%。

## 0.6.13 - 2026-10-01

- 報表頁的 IFRS 選項改為同時套用損益、資產負債、權益變動及試算表；Excel 四大財報沿用同一選項。現金流量表繼續由實際銀行流水計算，畫面明示非現金調整不列為現金收支。
- 共用已核准 IFRS 調整載入與期間過濾；期初權益與期末資產負債表採不同截至日。查詢筆數不符或調整後借貸不平時停止產生報表，不顯示不完整數字。
- 遠端回滾測試通過期間、期初、截至期末的已核准分錄範圍與平衡，排除草稿／沖銷；前端實際函式情境驗證 GAAP 損益 -200、IFRS 當期 -250、期初 -30、期末資產與負債權益均 800、期末權益 720，筆數不符會報錯。fixture 0。前端未部署，v1.0.0 保守完成度維持 30%。

## 0.6.12 - 2026-10-01

- 修正 IFRS 草稿直接刪除因缺少 DELETE RLS 規則而刪除零筆卻顯示成功的問題；前端改呼叫 `delete_ifrs_adjustment_draft`，核對回傳結果。
- 遠端套用 `20261001032907_delete_ifrs_adjustment_draft_atomic`；僅允許啟用中的管理員／會計刪除草稿，主檔與明細同交易刪除並寫 audit，撤銷直接 DELETE 權限。資料庫回滾測試涵蓋權限、重複刪除、已核准分錄與稽核，fixture 0；前端實際函式測試通過。
- 遠端 migration 153、本機 119；歷史基線仍未完全對齊。依使用者指示停止 Vercel 相關設定與部署；前端未部署，v1.0.0 保守完成度維持 30%。

## 0.6.11 - 2026-10-01

- IFRS 調整分錄建立改為單一 `create_ifrs_adjustment_atomic` RPC，同交易寫入主檔、全部明細及各筆 audit；登入者已撤銷直接 INSERT 主檔與明細的權限。管理員／會計可建立，員工與缺少 profile 者遭拒。
- 遠端已套用 `20261001031732_ifrs_adjustment_atomic`。資料庫回滾測試通過主檔＋兩行明細與 audit、借貸不平與無效科目整筆回滾、直接寫入拒絕、核准與沖銷 audit；前端實際函式確認只呼叫一次 RPC。fixture 0。
- 遠端 migration 152、本機 118；歷史基線仍未完全對齊。IFRS 調整其他財報合併、真實登入及全流程驗收尚未完成；v1.0.0 保守完成度維持 30%。本機前端未部署。

## 0.6.10 - 2026-10-01

- 修正「含 IFRS 調整」試算表原本納入草稿、已沖銷與期間外明細的錯誤；現在只查所選期間內 `approved` 分錄，並逐頁讀取全部明細及筆數。
- 資料庫回滾測試涵蓋期間內核准、期間外核准、草稿及已沖銷四種分錄；僅核准且期間內的兩行入帳，fixture 0。前端實際查詢函式的狀態／日期／inner join 條件與加總驗證通過。
- 調整分錄建立仍由前端分開寫主檔與明細，尚未符合 v1 原子交易條件；其他財報 IFRS 合併邏輯、完整瀏覽器驗收仍待完成。本機前端未部署，v1 保守完成度維持 30%。

## 0.6.9 - 2026-10-01

- 資產負債表的期間篩選改為截至期末的累積餘額；期初資產、負債與歷史未結轉損益不再被期間起日排除。前端實際函式以期初 1,000、本期支出 200 驗證兩側均為 800。
- 現有資料庫 2026 年 9 月以前有 3 筆分錄，9 月內有 2 筆。只取 9 月的銀行科目變動為 −880,000，截至 9 月底累積為 −904,200，確認舊期間過濾會漏掉期初變動。
- 財報總帳查詢、權益報表與 IFRS 調整資料載入失敗時回報錯誤，不再用可能不完整的本機資料或略過調整；報表畫面清除舊快照並顯示錯誤。完整四大財報資料庫勾稽與真實登入瀏覽器驗收仍待完成。
- v1.0.0 保守完成度維持 30%；本機前端未部署。

## 0.6.8 - 2026-10-01

- 修正現金流量表將每筆平衡分錄的借方減貸方相加、導致現金淨流量誤為 0 的錯誤。改依 `bank_transactions` 的收支方向、台幣基礎金額與交易／憑證活動分類計算；資料載入失敗時回報錯誤。
- 前端實際函式以收入、支出、跨幣別基礎金額、活動分類、沖回及未知方向情境驗證通過；目前資料庫 4 筆銀行流水淨變動 −904,200，排除非現金開帳與匯率重估後的總帳銀行科目變動亦為 −904,200。SQL 勾稽測試通過。
- 尚未完成所有財報逐表勾稽或真實登入瀏覽器驗收；v1.0.0 保守完成度維持 30%，本機前端未部署。

## 0.6.7 - 2026-10-01

- 補套用 `20261001024024_project_member_missing_profile_guard`：有 JWT subject 但無 profile 時明確拒絕，避免 SQL NULL 角色判斷略過限制。新增遠端回滾測試通過。

- 遠端已套用 `20260929080820_project_row_audit`：專案新增、修改、刪除會與資料異動同交易寫入 audit，紀錄操作者與異動前後內容；重複寫入相同內容不產生空稽核。資料庫回滾測試通過。
- 遠端已套用 `20261001021843_replace_project_members_atomic`：專案成員新增、移除與角色調整改為單次 RPC，鎖住專案並比對儲存前名單；原有 trigger 逐筆寫入 audit。撤銷登入者直接寫入成員表的權限。
- 遠端回滾測試通過成員三類異動與 audit、無效成員整批回滾、舊名單／重複成員拒絕、員工／空身分／跨部門主管拒絕、本部門主管成功；專案預算與外幣報支回歸重跑通過。專案與成員 fixture 均為 0。
- 遠端 migration 150 份，本機 116 份；歷史基線仍未完全對齊。前端未部署，舊版成員表直接寫入會被資料庫拒絕。v1 完成度保守維持 30%。

## 0.6.6 - 2026-09-29

- 專案預算改由 update_project_budget_atomic 單筆交易更新總額、餘額、部門／預設银行／名稱、變更歷史與 audit；操作者由登入身分取得，不接受前端指定。鎖定專案列並檢查舊總額，拒絕無原因、低於已使用額、非法金額與非啟用財務角色。
- 遠端套用 20260929080312_project_budget_atomic 及 20260929080520_project_budget_write_boundary；撤銷直接更新預算金額、寫入預算歷史及舊 deduct_project_budget 入口。舊前端直接寫預算會遭拒，必須搭配新版前端；本輪未部署。
- test_project_budget_atomic 遠端回滾測試通過總額／餘額／名稱／歷史／audit 一致、過期版本、低於已使用額、原因必填、外鍵失敗、員工／空身分拒絕與整筆回滾；直接寫入防線亦通過。外幣報支／預算扣抵／付款反轉回歸通過，專案 fixture 殘留 0。
- v1 完成度仍為 30%；專案建立／刪除與其他設定寫入 audit、完整新資料登入驗收、關閉／逾期核銷規則仍待完成。未處理 Vercel。

## 0.6.5 - 2026-09-29

- 帳號開通與既有帳戶的功能選項統一為自適應網格；勾選框固定大小並移除文字輸入框 padding，避免勾選框撐大與文字錯位。
- 部門管理改為整列寬度；新增表單控制項等高，修改／刪除按鈕同列對齊，小螢幕表格可橫向捲動。
- 交易入帳移除卡片的橫向 flex 排列；表單滿寬、欄位依可用寬度調整欄數，消除左側留白。
- 已檢查來源布局規則及發布檔案同步；尚未完成瀏覽器視覺驗收，尚未部署。

## 0.6.4 - 2026-09-29

- Gmail 寄信變數缺少或空白時，在建立帳戶前回傳 503 與設定說明；保留 Supabase invite 模式。此檢查不驗證實際 SMTP 投遞。
- 修正管理員重設密碼的 UUID 驗證少一組 4 碼，正常帳號可進入密碼更新流程。
- 新增 accountEmailConfiguration.html：實際 API 原始碼搭配模擬服務的五項情境已通過（缺少設定、Supabase 路由、SMTP 失敗、有效／無效重設 UUID），未寄信或修改真實帳戶。
- 前端及 API 尚未部署；正式環境仍需設定寄信憑證或已驗證的 Supabase SMTP 模式並重新部署。既有帳戶保留，不重複邀請。

## 0.6.3 - 2026-09-29

- 修正 profiles 更新 RLS 遞迴；遠端已套用 `20260929072018_fix_profile_update_policy`。管理員角色／權限／啟用更新、audit 與員工升權拒絕回滾測試通過。前端確認實際更新資料列，避免零筆更新誤報成功。
- 修正開通帳戶的部門 UUID 少一組 4 碼；實際 invite.js 的有效／無效 UUID 測試通過。尚未建立真實帳戶或寄送測試信。
- 財報簽名改用啟用帳戶姓名；會計角色為會計主管，專案部門 manager 為單位主管，全公司報表列出所有主管，多人以頓號列出。無帳戶顯示「尚未設定」，查詢失敗顯示「載入失敗」。目前無 accounting 帳戶，未任意變更角色。
- 報表橫幅、募資與 IFRS 卡片統一色票；補表格橫向捲動，刪除重複 390px media。AR 與樣式檢查實際於 504／1006px 通過，不能視為 390px 驗收。
- 專案／部門預算自動關閉與逾期核銷尚未實作：等待確認 10 天起算點，以及關閉後由申請人補送或會計代辦；未改動既有專案狀態。
- 前端尚未部署；正式站已查證為 v0.6.0（dpl_CejCm7tBFmRctkEtFtwmM8qtmmJ6）。390px 瀏覽器驗證因 workspace credits 不足，無法完成自動批准，仍待驗證。

## 0.6.2 - 2026-09-29

- 遠端套用 `20260929030440_rpc_require_registered_profile.sql`，19 個 RPC 增加空身分／profile 前置拒絕；既有部門、申請人及財務角色條件保留。舊付款與付款指派函式新增讀取單據前的財務角色檢查。
- `test_rpc_profile_guards.sql` 通過 38 項空身分／profile 檢查與 4 項員工／主管付款入口拒絕。月結與重開期間的狀態、操作者及 audit 測試通過。
- 報支外幣、主管簽核、單據直接修改拒絕、員工付款人、銀行開帳、期末匯差、跨幣 AP 等 7 組資料庫回滾測試通過。修正舊主管測試在未登入時查詢員工的 fixture 問題；匯差測試改為驗證直接寫總帳的權限拒絕，僅錯誤資料 fixture 使用管理角色佈置。

## 0.6.1 - 2026-09-29

- 修正 `set_bank_statement_match` 的空角色判斷：有 JWT subject 但無 profile 時，現在會在讀取帳單前拒絕操作。
- 配對改為比對完整 numeric 金額，避免 `40` 與 `40.001` 因四捨五入而被視為相同。
- 遠端已套用 `20260929025850_bank_statement_match_exact_amount.sql`。新增測試在修正前分別重現兩個問題，修正後通過配對、解除配對、金額／方向拒絕、重複配對、audit 與刪除流水同步解除配對；測試資料全數回滾。

## 0.6.0 - 2026-09-29

- 新增銀行對帳單逐筆配對介面與 `set_bank_statement_match` 原子 RPC；遠端已套用 migration `20260924082629_bank_statement_match_rpc`。資料庫回滾測試涵蓋角色、方向與金額、重複配對、解除配對與 audit；前端模擬資料瀏覽器測試通過，真實登入仍待驗收。
- 將舊 `styles.css` 與新主題合併為單一來源，將編輯風格色票放入 `:root`，移除第二份 CSS；金額欄位統一使用 `--font-mono`。發布目錄由來源重新產生，避免兩份檔案不同步。
- IFRS／IAS 說明改為預設收合的準則參考；交易借貸方長提示改為可點擊的 `?` 說明，保留鍵盤可操作性。
- 本機尚未部署正式站；完整登入、報表與對帳流程仍待驗收。

## 0.5.5 - 2026-09-24

- 遠端已套用 `bank_account_row_audit` 與 `bank_account_update_columns` migrations。銀行帳戶新增、修改、刪除透過同交易 trigger 寫入 audit，紀錄帳號末四碼而不保存完整帳號；登入角色僅能直接更新銀行主檔輸入欄位，不能改寫期初匯率、幣別鎖定等系統欄位。
- 資料庫回滾測試驗證三種異動皆有 audit、修改前後快照可追溯，且既有財務角色銀行 CRUD、手動交易三表同步、多來源開帳、幣別首次使用鎖定與一般員工／主管拒絕存取測試仍通過；測試後無殘留銀行 fixture。
- 銀行帳戶仍由財務角色直接寫入允許的主檔欄位；v1 的真實登入、對帳與報表勾稽仍待驗收。

## 0.5.4 - 2026-09-24

- 報支新建與修改重送在送出前再次核對主管的角色與部門；主管已調整時清除舊選項並顯示可操作的中文提示，避免直接顯示資料庫英文錯誤。
- 將報支基本資料、明細表、附件辨識按鈕與銀行帳戶卡片延伸為美編提案的紙張、深綠、細線及等寬金額風格；手機版改善欄位換行。
- 同步畫面版號、套件版本與文件為 `0.5.4`。遠端主管配置僅業務部有 `manager`，其餘部門仍需管理員設定主管並做真實登入驗收。

## 0.5.3 - 2026-09-24

- Added transactional audit rows to employee payee self-creation and default-recipient creation/update, including lookup of an existing payee.
- Revoked direct `INSERT`, `UPDATE` and `DELETE` on payees and payment recipients from API roles; the employee self-create and finance edit RPCs remain the write paths.
- Passed remote rollback tests for employee creation with and without bank details, existing-payee lookup, finance edits, foreign-currency voucher payment and payroll payment. Migration lint passed; test fixtures left no persistent rows.
- Restored the multi-recipient partial payment, foreign-currency payment and cross-currency AP database suites after direct table writes were revoked. Fixture setup runs with the test administrator inside rollback transactions; payment and role assertions still run as `authenticated`.

## 0.5.2 - 2026-09-24

- Revoked `TRUNCATE` from `anon` and `authenticated` on all current public tables and from future tables created by the `postgres` role. The remote privilege check found zero exposed tables with `TRUNCATE` access afterward.
- Revoked direct mutation privileges on transactions, bank transactions and journal entries. Authenticated users retain read grants; all supported postings and reversals continue through validated atomic RPCs.
- Passed remote rollback tests for direct ledger denial, three-table manual transaction FX snapshots, account edits, voucher payment, bank opening, AR invoice issue and AR receipts. Adjusted fixture setup that previously depended on direct authenticated ledger writes.

## 0.5.1 - 2026-09-24

- Revoked direct authenticated and anonymous mutation privileges on vouchers, voucher lines, invoices and voucher workflow logs. This prevents status, detail and history changes that bypass the atomic RPC flow; `TRUNCATE` is also denied.
- Kept validated manager, accounting and voucher edit RPCs working as `SECURITY DEFINER` functions with role checks; added an explicit finance role guard to accounting rejection.
- Passed remote rollback tests for direct write denial, manager approval and rejection, accounting rejection, voucher detail edits, foreign currency budgets, payment and reversal. Fixture data did not persist.

## 0.5.0 - 2026-09-24

- 依新版美編提案調整實際 Dashboard 的角色列、簽核步驟、指標卡、側欄權限圖例與響應式版面；所有數值仍來自現有資料查詢。
- 修正新建及修改重送報支單的主管清單，只列出所選部門的 `manager`，並在切換部門時清除舊選項；無主管部門顯示明確提示並阻止送出，資料庫維持同部門主管驗證。
- 新增專案費用報表與圓餅圖、原子付款拆分、原子付款人與收款帳戶儲存，以及單據與手動交易稽核。
- 收斂報支單直接新增權限，補主管審核角色驗證；v1.0.0 的真實登入驗收、測試資料清理與部署仍待完成。

## 0.3.0 - 2026-09-22

- Separate registered capital, company-profile paid-in capital and the actual 3110 ledger balance in every equity overview, with an always-visible reconciliation difference.
- Remove the synthetic report-only debit to bank and credit to capital. Financial statements now use posted journal entries only and can no longer appear balanced through data that does not exist in the ledger.
- Add finance-only shortcuts from the equity page to edit company capital metadata or prefill a real current-period financing receipt against account 3110, with an explicit warning not to duplicate amounts already included in bank opening balances.
- Preserve the current remote test fixture for continued regression (registered capital TWD 10,000,000; company-profile paid-in capital TWD 900,000) and expose its TWD 900,000 unposted reconciliation gap instead of silently posting it.
- Pass all 25 browser regressions, including company capital, equity statements, report export and application bootstrap. Production authenticated acceptance and opening-balance allocation remain pending.

## 0.2.99 - 2026-09-22

- Complete period-end unrealized FX revaluation for foreign bank and AR balances, with preview, atomic posting, next-day automatic reversal, idempotency, void audit and finance-only access.
- Add authoritative bank opening-balance dates, exchange-rate snapshots and generated TWD base amounts; compare bank reconciliation to the cumulative TWD ledger as of the report date.
- Apply the schema directly to Supabase and pass remote rollback, role, missing-rate, gain/loss and zero-residue checks plus all 25 browser regressions.
- Record the existing TWD 28,616,697 bank-opening-to-ledger gap as TASK-030; no unverified opening journal or capital entry was created.

## 0.2.98 - 2026-09-21

- Simplify capital setup around registered and paid-in totals, move contribution composition into an optional disclosure, and add a cash-only reset that changes the form without saving implicitly.
- Add an independent paid-in-capital effective date and use it for opening/current-period equity classification; remove the duplicate ledger-capital row unless a real reconciliation difference exists.
- Support cross-currency AP settlement with separate voucher and bank amounts, authoritative payment-date rates, realized FX gain/loss journals, idempotent payment and complete reversal.
- Apply both schema updates directly to Supabase, add covering indexes for the new payment currency foreign keys, and pass remote rollback plus all 23 browser regressions.

## 0.2.97 - 2026-09-21

- Add voucher date/currency selection, exchange-rate/base previews, and preservation of department budgets during rejected-voucher resubmission.
- Make voucher create/update RPCs snapshot the authoritative transaction-date rate, enforce atomic line totals and prevent applicant/status spoofing; disable the legacy non-atomic resubmit RPC.
- Consume and restore project or department budgets in base currency, reject insufficient budgets atomically, and extend receipt-type compatibility to the existing voucher UI.
- Apply the changes directly to Supabase, pass rollback/security/currency/budget/reversal tests with zero fixture residue and pass all 21 browser regressions.

## 0.2.96 - 2026-09-17

- Make paid-in capital directly editable while preserving non-cash contribution categories and applying the entered total through the cash-contribution residual.
- Replace the ambiguous no-period equity statement on the fundraising tab with a capital/equity overview that separates registered, paid-in, uncommitted and ledger capital from accumulated profit or loss.
- Keep the formal date-scoped statement-of-changes-in-equity logic unchanged, verify production aggregates without mutating them, and pass all 20 browser regressions.

## 0.2.95 - 2026-09-17

- Replace the broken payroll RPC values with an idempotent atomic entry point that reuses the standard voucher split payment flow, including ordered payment numbers, recipient snapshots, bank movements, journals and reversals.
- Add payroll request IDs/hashes, finance-only read policies, revoked direct table writes, complete recipient validation and aggregate audit records without payroll personal details.
- Snapshot bank currency and payment-date exchange rates on payroll batches/items and expose generated base amounts; update the payroll UI for currency labels, strict amount validation, retry-safe UUIDs and reversal status.
- Pass remote USD/base/idempotency/rollback/audit/role/reversal tests with zero fixture residue and all 20 browser regressions. Production role acceptance remains pending, so the release is not `1.0.0`.

## 0.2.94 - 2026-09-17

- Add explicit cash, property, technology and merger contribution inputs; calculate paid-in capital from those four sources and reject amounts above total capital.
- Separate shareholder contributions from company capital settings. Saving the director/shareholder list no longer silently rewrites cash capital; an explicit fill action is available for intentional synchronization.
- Replace delete-then-insert shareholder writes with the role-restricted, audited `save_company_shareholders` atomic RPC and remove direct authenticated mutation grants.
- Add a capital-only audit trigger that stores old/new capital amounts without duplicating company or shareholder personal data.
- Pass Supabase rollback/permission/data-preservation checks and all 19 browser regressions. Production role acceptance remains pending, so the release is not `1.0.0`.

## 0.2.93 - 2026-09-17

- Fix Excel financial-report export crashing when income statements and balance sheets return structured objects instead of arrays.
- Add a shared `flattenFinancialStatementRows` representation for sections, nested subsections, items, subtotals, totals and net profit; use it in both screen rendering and Excel export.
- Pass the selected start/end dates to all four statement builders and the exported journal so workbook headings and values cover the same period.
- Add structured/nested export and date-propagation regression coverage; pass all 18 browser regressions.
- Regenerate the sanitized public-upload staging after the source change. Production authenticated download acceptance remains pending, so the release is not `1.0.0`.

## 0.2.92 - 2026-09-17

- Fix the no-period equity overview so configured cash, property, technology and merger contributions appear as opening paid-in capital.
- Scope the synthetic paid-in-capital journal supplement to the selected reporting period, preventing capital before the start date from being counted again as a current-period change.
- Centralize the seven equity-statement rows and add regression coverage for contribution totals, date boundaries and ending-equity reconciliation; pass all 17 browser regressions.
- Keep Chrome test profiles inside the disposable test output directory and remove each profile in `finally`; delete 379 stale `.tmp-*` directories totaling about 4.08 GiB.
- Add government-grant recognition and traceability requirements to the existing deferred-revenue task. Production authenticated acceptance remains pending, so the release is not `1.0.0`.

## 0.2.91 - 2026-09-15

- Add currency selection to bank-account create/edit flows and lock the selector after the account has a balance or financial reference.
- Apply `bank_statement_currency_import` and its FK index directly to Supabase. Store statement currency, transaction-date rate and generated expense/income/balance base amounts.
- Replace browser-side statement inserts with atomic `import_bank_statement_rows`, database dedupe, full-batch rollback and one import audit event. Imported financial fields are immutable.
- Restrict statement rows and RPC to accounting/admin/super_admin, revoke anon and direct authenticated insert, and escape parsed PDF text before preview rendering.
- Pass remote USD/rate/base/dedupe/rollback/audit/role tests, preserve all 32 existing TWD rows with correct base values, and pass all 16 browser/API syntax regressions.
- Production authenticated acceptance remains pending, so the release is not `1.0.0`.

## 0.2.90 - 2026-09-15

- Apply `voucher_payment_splits_and_reversals` and `voucher_payment_audit_hardening` directly to Supabase, adding per-line recipient/bank splits, partial payment status, immutable recipient snapshots and reversal traceability.
- Replace the single-recipient payment dialog with line groups, recipient name search, separate company bank selection, exact per-line totals and selective payment; update payment history, voucher center and Excel export for all splits.
- Prevent duplicate payments before confirmation resolves and lock the editor after a committed payment whose UI refresh fails.
- Pass remote split/FX/role/idempotency/rollback/reversal tests and all 15 desktop/mobile/browser regressions, including explicit horizontal-overflow assertions and static parsing of all server API files.
- Remove the shared invite default password. Gmail fallback now creates a unique temporary password per account, escapes email content and never returns the password in the API response.
- Add a public-upload allowlist, scanner and sanitized `.release-upload/` staging generator; exclude real invoice images, attachments, financial exports, backups, environment files and credentials from GitHub. Supplied invoice images remain private model fixtures only.
- Production authenticated acceptance, SMTP delivery and real invoice-model execution remain pending, so the release is not `1.0.0`.

## 0.2.89 - 2026-09-14

- Apply AR aging, receipt reversal and cross-currency receipt allocation directly to Supabase; keep local reference SQL and rollback tests under `tools/sql/`.
- Add finance-only historical aging by customer, department, project and overdue bucket with server pagination and separate totals per currency. Future receipts no longer alter earlier as-of balances.
- Add atomic receipt reversal with date, reason, revision/idempotency checks, mirrored bank movement and journals, restored invoice balances and complete audit history. Posted records remain immutable.
- Allow invoice-currency `amount` and bank-currency `receipt_amount` per allocation; post cash and receivable base values separately and recognize the resulting realized FX gain or loss.
- Verify two independent concurrent receipt/issue scenarios: row locks reject or serialize conflicting writes without over-allocation, credit-limit breach or partial records.
- Pass AR core, FX, role, reversal, aging and credit-limit remote tests plus all 12 desktop/mobile browser regressions. Authenticated Production acceptance remains pending, so the release is not `1.0.0`.
- Treat the four supplied invoice images as live-model fixtures rather than UI assets; score document type on the three single-invoice cases and require field abstention for the multi-document image. Actual model execution still requires the original local files and a test session token.

## 0.2.88 - 2026-09-14

- Apply `ar_receipt_core` and `restrict_ar_financial_visibility` directly to Supabase, adding finance-only receipts, allocations, an invoker balance view and atomic `post_ar_receipt` posting.
- Support one receipt across multiple invoices, repeated partial receipts, exact outstanding balances, same-currency foreign receipts and realized FX gain/loss while keeping bank movements, transactions, journals, invoice status and audit in one database transaction.
- Reject over-allocation, duplicate invoice allocation, stale retry payloads, closed periods, missing rates, cross-currency banks, direct table writes and manual mutation of AR-linked ledger rows.
- Enforce customer credit limits while issuing invoices under a customer row lock; treat null as unlimited and zero as no credit, and release available credit after posted receipts.
- Add finance-only AR receipt search, customer lookup, currency-compatible bank selection, invoice allocation entry and receipt details on desktop and mobile.
- Preserve `ar_receipt_id` in transaction mapping; show AR receipt numbers and prevent manual account editing, single deletion and bulk manual-entry deletion for AR-generated rows.
- Pass AR core/FX/role/credit rollback tests, legacy manual transaction and bank regression tests, migration lint, plus all desktop/mobile browser regressions. Voiding, aging and cross-currency settlement were completed in 0.2.89; authenticated production acceptance remains pending.

## 0.2.87 - 2026-09-10

- Apply the AR invoice core directly to Supabase with draft and invoice sequences, invoice lines, finance-only RLS, atomic save/issue RPCs and same-transaction audit logs.
- Post receivable, per-line revenue and output-tax journals when an invoice is issued; snapshot currency rates and reject missing rates, closed periods, inactive customers, stale revisions and project/department mismatches without partial writes.
- Add finance-only receivable invoice search, draft editing, customer lookup, project/department selection, per-line revenue accounts, totals, issue confirmation and read-only issued details.
- Calculate customer payment-term due dates with timezone-independent calendar arithmetic so Taiwan browsers do not shift the date one day earlier.
- Include AR customer and invoice actions in Audit Trail, and pass remote rollback/role/FX tests plus desktop/mobile browser regressions. Receipts, allocations, voiding, aging and credit-limit enforcement remain pending.

## 0.2.86 - 2026-09-10

- Add finance-only paginated customer management with search, create, edit, deactivate, complete replacement payloads and optimistic revision checks.
- Verify customer UI retries reuse the same UUID, duplicate submissions are locked, stale list responses cannot be accepted, and committed-save/list-refresh failures remain distinguishable.
- Verify the full app still loads its login screen and the customer form remains within a 390px screenshot viewport.
- Add a deterministic browser regression runner; all five feature pages plus app bootstrap pass, and migration lint passes.

- Apply AR customer master and atomic save/audit RPC remotely, with revision conflicts, restricted table access and rollback regression tests. Customer UI and AR invoice/receipt workflows remain pending.

- Remove transaction account dialogs synchronously on dismissal; verify duplicate-submit locking and committed-save/failed-refresh behavior. Rerun transaction list regressions.

- Reject conflicting OCR date/month fields; add a live API sample-test runner with per-field checks and input hashes. Actual user-sample model runs remain pending source images and authenticated test access.

- Add per-file batch invoice recognition with partial-failure recovery and employee-owned expense descriptions.
- Validate OCR uploads and extracted dates/amounts; add mocked browser/API regression tests.
- Google Drive archiving and real-invoice accuracy validation remain pending (TASK-029); no deployment or training claimed.

## 0.2.85 - 2026-09-07

- Paginate transaction rows with exact counts and stable ID ordering; batch journal UUID filters.
- Fail visibly on incomplete pages, count changes, duplicate IDs or backend errors.
- Clear deletion caches at load start and ignore stale render results.
- Preserve multiple debit/credit account summaries per transaction.
- Browser regression tests cover 1251 transactions, 1320 journals, response caps, errors, empty filters and render races.

## 0.2.84 - 2026-09-07

- Snapshot payment-date currency/rate in voucher payments, bank movements and per-account journals.
- Reject mismatched bank/voucher currencies, missing rates, invalid amounts, inconsistent line totals and pre-existing partial payments.
- Preserve idempotent payment behavior and display payment currency/rate/base amount in payment views and export.
- Verified rollback FX two-account and TWD payment tests; no browser end-to-end acceptance claimed.

## 0.2.83 - 2026-09-07

- Lock bank currency when an opening balance or first reference exists, including statement, voucher, payroll and project references.
- Preserve the lock after reference deletion; reject attempts to clear it.
- Serialize manual entries with bank currency edits using a bank row update lock.
- Display currency lock state; verified rollback tests and existing FX/role regression suites.

## 0.2.82 - 2026-09-07

- Snapshot bank currency and the latest rate on or before the transaction date in all three manual-entry records.
- Force TWD rate to one; reject missing/inactive currencies, missing rates and nonfinite amounts before writing.
- Preserve historical entry rates when exchange-rate master data changes.
- Show transaction currency/rate/base amount and allow decimal entry amounts.
- Verified FX and TWD synchronization, invalid-input rejection, and the existing bank role regression suite using rollback SQL tests.

## 0.2.81 - 2026-09-07

- Reject missing-profile callers in both manual transaction mutation RPCs.
- Align super_admin policies across bank accounts, bank movements, transactions and journal entries.
- Require a returned bank row for update/delete success; refresh balances and reports after transaction deletion.
- Verified rollback integration tests for admin/accounting/super_admin and denied manager/employee/missing-profile cases.

## 0.2.80 - 2026-09-07

- Calculate bank account balances from all posted movements instead of the opening-balance generated column.
- Applied the invoker balance RPC directly to Supabase; verified aggregation beyond 1000 movements and role restrictions.
- Refresh bank accounts after manual entry and payment; refresh reports after payment and show account currency.
- Authenticated browser workflows remain pending validation.

## 0.2.79 - 2026-09-04

- Added an Exchange Rate Management card to the Settings page for accounting/admin/super_admin users.
- Added currency/date/rate/source inputs and upsert behavior for `exchange_rates`.
- Added a recent exchange-rate list with edit/delete actions for non-system rates.
- Locked TWD/system exchange rates in the UI so the functional currency baseline cannot be deleted.
- Kept non-TWD transaction/voucher entry disabled for now; this release only adds rate maintenance.
- Verified local app load through headless Chrome without a bootstrap error banner.

## 0.2.78 - 2026-09-04

- Merged the useful parts of Claude package `netlify-fixed (1).zip` without replacing the current working tree.
- Fixed equity statement opening balances by calculating prior-period cumulative share capital and retained earnings.
- Expanded the equity statement rows to show opening capital, opening retained earnings, current-period capital movement, net income, ending capital, ending retained earnings, and ending equity total.
- Replaced deprecated `src/modules/voucher/voucherFormLines.js` with a guard module so corrupted legacy form handlers cannot override the active `scripts/ui.js` flow.
- Verified local app load through headless Chrome without a bootstrap error banner.

## 0.2.77 - 2026-09-04

- Fixed `main.js:5 App bootstrap failed: SyntaxError: Invalid or unexpected token`.
- Rebuilt corrupted `scripts/reports.js` strings so reports can be imported again.
- Rebuilt corrupted accounting fallback modules: `chartOfAccounts.js`, `journal.js`, `cashflow.js`, and `equity.js`.
- Preserved the 0.2.76 base amount reporting logic for multi-currency readiness.
- Verified the local app loads the login page through headless Chrome without the bootstrap error banner.

## 0.2.76 - 2026-09-04

- Added multi-currency foundation through Supabase migration `20260904112000_multicurrency_foundation.sql`.
- Added `currencies`, `exchange_rates`, `get_exchange_rate()`, and seeded TWD/USD/JPY/CNY/EUR.
- Added currency/exchange-rate/base amount columns to bank accounts, journal entries, bank transactions, transactions, and vouchers.
- Added `source_type` and `source_id` on journal entries for future AR, FX revaluation, and subledger traceability.
- Added source tracking trigger for journal entries so voucher/manual sources are inferred consistently.
- Restricted direct execute privileges on the journal source tracking trigger function.
- Updated reports and ledger queries to prefer base amounts with legacy fallbacks.
- Directly applied the Supabase migration to project `imlmclalgbfxhhnpsyam` and verified TWD base amount parity.

## 0.2.75 - 2026-09-04

- Added accounting period lock foundation through Supabase migration `20260904101000_accounting_period_locks.sql`.
- Added `accounting_periods`, close/reopen RPCs, RLS, audit logging, and closed-period mutation guards for vouchers, bank transactions, transactions, and journal entries.
- Added the settings-page accounting period UI for closing, refreshing, and reopening periods.
- Added a user-facing closed-period error translation for accounting period operations.
- Directly applied the Supabase migration to project `imlmclalgbfxhhnpsyam` and verified table, functions, triggers, and anon/authenticated execute grants.
- Expanded pending ERP-gap tasks for AR, multi-currency, tax, fixed assets, collections, revenue recognition, self-service reporting, and SOD visibility.
- Kept production deployment manual; production still needs redeploy and end-to-end validation.

## 0.2.74 - 2026-09-04

- Rebuilt corrupted `voucherApi.js`, `attachments.js`, `voucherStatus.js`, and `uiHelpers.js` sections with stable ASCII strings.
- Removed unreachable legacy payment modal code; `openCloseVoucherModal()` and `confirmCloseVoucher()` now only route to the controlled payment queue.
- Removed unreachable legacy voucher line/invoice rewrite blocks from `updateVoucher()`.
- Added runtime label association support and filled static `for` attributes for accessible form controls.
- Kept deployment manual per user instruction; production still needs redeploy and end-to-end validation.

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
