# 財務管理系統

目前本機版本：`0.2.99`

## 0.2.99 重點

- 完成 TASK-021：設定頁可預覽並過帳外幣銀行與 AR 期末未實現匯差，資料庫同步建立次日自動反轉，支援冪等、作廢、audit 與財務角色隔離。
- 銀行期初餘額新增基準日、權威匯率及 TWD base 快照；銀行餘額勾稽改以截至報表日的 TWD base 與總帳比較，不再混加不同原幣。
- Supabase 已直接套用並通過 gain/loss、缺匯率回滾、反轉、作廢與角色測試；完整 25 項桌面／窄螢幕／API／bootstrap 回歸通過。
- 正式 9 個銀行帳戶的既有期初餘額合計 TWD 28,616,697 尚無對應開帳分錄，已列 TASK-030；系統沒有擅自把差額記入股本。

## 0.2.98 重點

- 公司設定以「資本總額」與「已投入股本」為主要輸入；四種出資方式收進選填明細，可一鍵將已投入總額重設為現金出資，既有正式數字未被清除。
- 新增獨立「已投入股本生效日」，權益變動表不再借用預定開業日判斷期初／本期；股東權益總覽移除重複帳載列，只有實際差異才提示。
- 一般 AP 可用不同幣別銀行付款，分開保存 voucher 原幣與銀行結算金額／匯率／base，並自動認列已實現匯兌損益；同幣別既有 payload 保持相容。
- Supabase 已直接套用股本日期與跨幣別付款資料庫調整；遠端回滾、冪等、反轉、資料保留及完整 23 項瀏覽器回歸通過。

## 0.2.97 重點

- 報支新增與修改重送可選日期及幣別，顯示歷史匯率與台幣換算預覽；部門預算重送不再被清空。
- Supabase 由單據日期取得並保存匯率快照，會計核准及付款沖銷改以 `total_amount_base` 扣回台幣預算，預算不足會整筆回滾。
- 建立 RPC 固定申請人與待主管審核狀態，明細合計由資料庫驗證；舊非原子 `resubmit_voucher` 已停止供 authenticated 呼叫。
- 遠端 rollback／權限／匯率／預算／反轉測試與 21 項瀏覽器回歸通過，測試資料殘留及現有 voucher base 不一致均為 0。

## 0.2.96 重點

- 「已投入股本（實際到位）」改為可直接編輯；系統以現金出資調整差額，不會覆寫財產、技術或合併新設出資。
- 股東權益總覽不再將無期間資料硬列為「期初股本」，改為分開顯示資本總額、已投入、尚未投入、帳載股本、累積盈虧與目前股東權益。
- 正式權益變動表的期間期初／本期／期末邏輯維持不變；資本與權益回歸及完整 20 項瀏覽器回歸全數通過。
- 遠端資本資料仍為資本總額 10,000,000、已投入 900,000，本版沒有清除或改寫正式資料。

## 0.2.95 重點

- 修正薪資批次 RPC 寫入無效 voucher 類別與付款型態、造成送出必定失敗的問題；薪資付款改走既有付款拆分核心，統一產生付款序號、收款人快照、銀行流水與逐筆分錄。
- 新增 client request UUID 與 request hash，連線中斷後重試不會重複出款；薪資批次與明細不可由前端直接增刪改，僅財務角色可讀並呼叫原子 RPC。
- 薪資依出款銀行幣別與付款日匯率保存 currency、rate 與 generated base 金額，最近批次顯示原幣、匯率、台幣及付款／反轉狀態。
- 遠端外幣、回滾、冪等、audit、角色及反轉測試與完整 20 項瀏覽器回歸通過；Production 真實角色付款仍待部署後驗收，因此未升 `1.0.0`。

## 0.2.94 重點

- 公司設定新增現金、財產、技術與合併新設四種可編輯出資；`已投入股本` 改為四項即時計算，並阻擋高於資本總額的設定。
- 董監出資合計只作勾稽，不再於儲存名單時暗中覆寫現金出資；需要同步時必須明確按「將出資合計帶入現金出資」並另行儲存公司資料。
- 董監名單改走 `save_company_shareholders` 原子 RPC，失敗完整回滾並寫入不含個資的彙總 audit；資本欄位變更另有專用 audit trigger。
- Supabase 回滾／權限測試與完整 19 項瀏覽器回歸通過；Production 真實角色操作仍待部署後驗收，因此未升 `1.0.0`。

## 0.2.93 重點

- 修正 Excel 匯出對結構化損益表／資產負債表呼叫 `rows.map` 而中斷；共用攤平規則支援大項、子分類、項目、小計、總計與本期淨利。
- 匯出的四張財報及會計分錄都套用畫面選擇的起訖日期，表頭期間與內容不再不一致。
- 新增 Excel 報表結構與日期參數回歸，完整 18 項瀏覽器測試通過；`.release-upload` 會在本版驗證後重新產生。
- Production 真實登入及實際下載檔案驗收仍未完成，因此未升 `1.0.0`。

## 0.2.92 重點

- 無期間篩選的股東權益總覽改以公司設定四種出資合計作為期初股本；有期間報表則只在預定開業日落於區間內時列為本期股本變動，避免期初與本期重複。
- 共用權益計算同時供畫面、明細與匯出使用；新增期初／期間邊界／期末勾稽測試，完整 17 項瀏覽器回歸通過。
- 瀏覽器測試 profile 改放單次測試輸出目錄並以 `finally` 清除；已刪除 379 個舊 `.tmp-*` 目錄（約 4.08 GiB）。
- 政府計畫補助款不得直接當股本；條件與認列政策需由會計師確認，系統化需求已併入 `TASK-026`。Production 真實登入驗收仍未完成，因此未升 `1.0.0`。

## 0.2.91 重點

- 銀行帳戶新增／編輯可選幣別；已有期初餘額或關聯資料後，畫面與資料庫都會鎖定幣別。
- 銀行 PDF 對帳單不再由前端直接 insert，改走 `import_bank_statement_rows` 原子 RPC；依銀行幣別及每筆交易日取得匯率，保存原幣、匯率、支出／收入／餘額 base 金額。
- 重複列由資料庫唯一鍵處理，兩人同時匯入也不會重複；任一日期、金額或匯率錯誤會整批回滾，成功匯入寫 audit。
- 對帳原始財務欄位匯入後不可直接改寫，一般員工不可讀／匯入，anon 不可執行；PDF 解析文字在預覽前會 HTML 跳脫。
- 遠端回滾與資料一致性查核通過，16 項瀏覽器／API 語法回歸通過。Production 真實登入驗收仍未完成，因此未升 `1.0.0`。

## 0.2.90 重點

- 一張報支可按每個明細拆給多位收款人及不同公司出款銀行，並可只勾選部分拆分先付款；每筆都保存獨立付款號碼、收款快照、銀行流水與分錄。
- 已付款拆分不可改寫；作廢以反向流水及反向分錄保留歷史。金額不等於各明細或整張單據時整筆拒絕，快速連點及已付款但畫面刷新失敗也不會重複付款。
- 一般員工不可讀完整拆分／收款主檔；付款人明細、憑證中心、付款清單與 Excel 匯出均已改用多筆付款資料。
- 移除邀請帳號共用預設密碼；Gmail fallback 改為每位使用者獨立臨時密碼，API 不回顯密碼。
- 新增 GitHub 公開上傳白名單與機密／個資檢查器；發票圖片只作模型私有樣本，不會放入 UI 或 repository。
- 遠端付款拆分與外幣付款回歸、15 項桌面／手機與 server API 語法測試通過。Production 真實登入驗收仍未完成，因此未升 `1.0.0`。

## 0.2.89 重點

- AR 帳齡可依基準日、客戶／發票、部門、專案與逾期區間查詢，採伺服器分頁並依幣別分開彙總；未來收款不會回頭改變歷史帳齡。
- 已入帳收款可由財務角色輸入反轉日期與原因進行沖銷；銀行流水、交易與分錄以相反方向完整保留，發票未收餘額及 audit 同一交易恢復。
- 跨幣別收款逐張保存發票原幣沖銷金額與銀行實收金額，分開計算 base 金額並認列已實現匯兌損益。
- 同一發票同時收款、同一客戶同時收款與開立發票的雙連線測試已通過；沒有超額、信用額度穿透或部分寫入。
- 遠端 AR 回歸及 12 項桌面／手機視窗瀏覽器測試通過。正式環境真實登入驗收尚未完成，因此未升 `1.0.0`。

## 0.2.88 重點

- 財務角色可登錄 AR 收款，一筆收款可沖銷多張發票，同一張發票也可分次收款；清單與明細會顯示原幣、台幣、發票匯率、收款匯率及已實現匯差。
- `post_ar_receipt` 以單一 Supabase 交易同步建立收款、沖銷、銀行流水、交易、日記帳與 audit；超額沖銷、重複發票、缺匯率、關帳、錯誤角色或部分寫入均拒絕。
- 發票開立會以客戶幣別檢查未收餘額與信用額度，客戶列鎖避免同時開立一起超額；部分收款會釋放額度，空白代表不設上限，0 代表不可賒帳。
- 交易清單會辨識 AR 收款來源，不再標成手動入帳，也不提供手動科目編輯／刪除；批次刪除手動交易不會選到 AR 收款資料。
- 遠端 AR 核心、外幣匯差、信用額度、角色隔離與既有交易回歸均通過；作廢反轉、帳齡分析與跨幣別收款已於 0.2.89 完成，正式登入驗收仍待 TASK-022。

## 0.2.87 重點

- 財務角色可建立、修改及查詢應收發票草稿，每張發票支援最多 200 筆收入項目與各自收入科目。
- 正式開立由 Supabase 原子 RPC 產生順序發票號碼及應收、收入、銷項稅額分錄；已開立資料不可再編輯。
- 發票日期匯率會保存為快照，外幣 base 金額與分錄已通過回滾測試；缺匯率、停用客戶、關帳與專案／部門不一致均整筆拒絕。
- AR 客戶與發票 audit 已顯示在 Audit Trail。收款沖銷、作廢、帳齡與信用額度控管仍待 TASK-022，因此未升 `1.0.0`。

## 0.2.86 重點

- 財務角色新增客戶管理：名稱搜尋、狀態篩選、新增、編輯、停用、幣別、帳期與信用額度；使用 revision 防止舊畫面覆蓋新資料。
- AR 客戶與付款人分開，客戶與 audit 由同一 RPC 保存；遠端權限、回滾及角色測試通過。
- 報支表新增發票批次辨識，每檔帶入號碼、月份、金額，項目由員工填寫並覆核。Google Drive 歸檔與真實發票模型測試仍待 TASK-029。
- 交易科目編輯補齊關帳、付款關聯、權限、重複送出與部分更新防線。AR 發票與同幣別收款已於後續版本完成；帳齡與正式登入端到端驗收仍待處理。

## 0.2.85 重點

- 交易清單改用分頁，分錄查詢以 100 個交易 ID 分批，避免筆數截斷或 URL 過長。
- 載入失敗、空篩選時不保留舊刪除清單；較舊請求不能覆蓋最新畫面。
- 同一交易的多組借貸科目會一起顯示，分錄載入失敗不再冒充「未入帳」。
- 瀏覽器模擬回歸測試通過，尚未完成真實登入端到端驗收；本輪沒有 Supabase schema 變更。

## 0.2.84 重點

- 單據付款依付款日期儲存匯率，銀行流水、逐科目分錄與付款憑證使用相同快照。
- 單據和付款銀行須為相同幣別；缺少匯率、明細總額不一致時整筆拒絕。
- 付款清單、明細及憑證補幣別；付款憑證與 Excel 匯出補匯率／台幣金額。
- Supabase 已直接套用，外幣兩科目付款、台幣付款、拒絕回滾與重複付款測試通過。跨幣別支付、薪資、AR 及完整瀏覽器驗收仍待完成。

## 0.2.83 重點

- 銀行帳戶有期初餘額，或首次被交易、流水、對帳、付款、薪資、專案引用後，資料庫會鎖定幣別。
- 刪除關聯資料仍保留鎖定；一般名稱／備註修改不受影響。銀行清單顯示幣別鎖定狀態。
- Supabase 已直接套用；鎖定、外幣入帳及角色回歸測試通過。
- 幣別選擇介面及其他外幣付款流程仍待完成，尚未升為 1.0.0。

## 0.2.82 重點

- 手動入帳依銀行帳戶幣別，取交易日當日或之前最近一筆匯率，同步寫入交易、流水與日記帳。
- TWD 固定匯率 1；查不到外幣匯率時拒絕入帳。已入帳匯率不隨匯率主檔修改而變動。
- 交易金額支援小數，清單顯示原幣、匯率與台幣換算金額。
- Supabase 已直接套用，外幣／TWD 三表同步及無效輸入測試通過。銀行幣別維護、外幣付款／報支、AR 與匯兌重估仍待完成。

## 0.2.81 重點

- 修正 super_admin 銀行、交易及日記帳權限不同步，避免入帳後看不到分錄。
- 手動交易新增／刪除 RPC 明確拒絕缺少 profile 的登入帳號。
- 銀行更新／刪除必須實際影響一筆資料才算成功；交易刪除後刷新銀行餘額。
- Supabase 已直接套用，三個財務角色的入帳／刪除三表同步測試通過。完整瀏覽器驗收及多幣別、AR 尚未完成。

## 0.2.80 重點

- 修正銀行帳戶只顯示期初餘額：改由 Supabase 彙總全部已入帳收入與支出。
- 交易新增與付款完成後刷新銀行餘額；付款也同步刷新財報。
- Supabase `bank_account_live_balances` 已直接套用，無需透過 GitHub 執行 migration。
- 資料庫彙總與權限測試已通過；瀏覽器登入付款流程與正式部署仍待驗收，尚未升為 1.0.0。

## 0.2.79 重點

- 設定頁新增「匯率管理」卡片，與月結鎖帳一樣只顯示給會計/admin/super_admin。
- 可選擇外幣、匯率日期、兌 TWD 匯率與來源，儲存時同幣別同日期會更新既有資料。
- 匯率列表顯示最近 80 筆，外幣手動/API 匯率可編輯或刪除，TWD/system 匯率鎖定。
- 這一步只完成匯率維護，不開放外幣報支/交易輸入，避免半套外幣流程影響財報。
- 本機 HTTP + headless Chrome 已確認登入頁可載入，未顯示 bootstrap error banner。
- Production 仍需重新部署 `0.2.79` 並做實際登入、報支、付款與財報驗收。

## 0.2.78 重點

- 權益變動表不再把期初股本寫死為 0。
- 有報表起始日時，權益變動表會先抓起始日前一天以前的累計試算表，再加上本期股本變動與本期損益。
- 權益變動表改列：期初股本、期初保留盈餘、本期股本變動、本期損益、期末股本、期末保留盈餘、期末權益合計。
- 舊 `src/modules/voucher/voucherFormLines.js` 已改為 deprecated guard，避免壞碼表單 handler 覆蓋正式 `scripts/ui.js` 流程。
- 本機 HTTP + headless Chrome 已確認登入頁可載入，未顯示 bootstrap error banner。
- Production 已由後續 `0.2.79` 接續，仍需重新部署並做實際登入、報支、付款與財報驗收。

## 0.2.77 重點

- 修復 `main.js:5 App bootstrap failed: SyntaxError: Invalid or unexpected token`。
- 重建報表與會計 fallback 模組內的壞碼字串，避免 `scripts/reports.js`、`src/modules/accounting/*.js` import 失敗。
- 保留財報/總帳優先使用 `debit_amount_base`、`credit_amount_base`、`amount_base` 的 0.2.76 多幣別地基。
- 本機 HTTP + headless Chrome 已確認登入頁可載入，未顯示 bootstrap error banner。
- Production 已由後續 `0.2.78` 接續，仍需重新部署並做實際登入、報支、付款與財報驗收。

## 0.2.76 重點

- 新增多幣別資料庫地基：`currencies`、`exchange_rates`、`get_exchange_rate()`。
- `journal_entries`、`bank_transactions`、`transactions`、`vouchers` 已新增 `currency`、`exchange_rate` 與 base 金額欄位。
- `bank_accounts.currency` 已成為真正幣別 FK，預設 `TWD`。
- 財報與總帳查詢已改為優先使用 base 金額，TWD 現有數字維持一致。
- Supabase 遠端 project `imlmclalgbfxhhnpsyam` 已直接套用 `multicurrency_foundation`。
- Production 已由後續 `0.2.77` 接續，仍需重新部署並做 TWD 既有流程與財報驗收；非 TWD 前端開放仍留在後續任務。

## 0.2.75 重點

- 新增會計期間/月結鎖帳資料庫地基：`accounting_periods`、close/reopen RPC、RLS 與 audit log。
- Supabase 遠端 project `imlmclalgbfxhhnpsyam` 已直接套用 `accounting_period_locks`。
- 已關帳期間會擋 `journal_entries`、`bank_transactions`、`transactions`、`vouchers` 的新增、修改與刪除。
- 設定頁新增「會計期間 / 月結鎖帳」管理畫面，可關帳、重整期間清單與重開期間。
- Oracle 財務管理能力缺口已拆入 pending：AR、多幣別、稅務、固定資產、催收、收益認列、自助報表與 SOD 儀表板。
- Production 已由後續 `0.2.76` 接續，仍需重新部署並做實際登入、報支、付款、收入、財報與月結鎖帳驗收。

## 0.2.74 重點

- 重建 `voucherApi.js`、`attachments.js`、`voucherStatus.js` 與 `uiHelpers.js` 的壞碼區塊，避免未閉合字串造成 App bootstrap 失敗。
- 清除 `openCloseVoucherModal` / `confirmCloseVoucher` 內已不可達的舊付款流程，保留正式付款 queue。
- 清除 `updateVoucher()` 內不可達的舊明細/發票 rewrite block，單據修改只走 Supabase RPC。
- 靜態表單 label 已補 `for`，並新增 runtime label association observer，動態 modal 也會自動補關聯。
- Production 已由後續 `0.2.76` 接續，仍需重新部署並做實際登入、報支、刪除單據、退件重送、付款、財報驗收。

## 0.2.73 重點

- Supabase 遠端已直接新增 `delete_voucher_cascade` RPC，單據刪除改由資料庫一次處理 voucher、明細、發票、付款、workflow、銀行流水、日記帳與手動交易關聯。
- `deleteVoucher()` 已改呼叫 RPC；Storage 附件檔案刪除失敗會回報警示，但不會留下資料庫半刪狀態。
- `update_voucher_with_details` 已直接更新到 Supabase：退件後重送時，主檔/明細/發票/status/workflow log 同一交易完成。
- 重送流程不再由前端另外手動 insert workflow log，避免狀態更新成功但紀錄失敗。
- Production 已由後續 `0.2.76` 接續，仍需重新部署並做實際登入、報支、付款、財報驗收。

## 0.2.72 重點

- 交易入帳現在會清楚顯示 debit/credit：收入預設借方銀行、貸方收入；支出預設借方費用/成本、貸方銀行，且可手動調整。
- 一般員工輸入身分證/統編查無付款人時，可以新增該付款人；仍不開放完整付款人名單。
- 付款人明細 modal 改為不透明白色卡片，可清楚查看付款紀錄並點擊查看單據。
- 銀行帳戶卡片排版調整，長帳號與綁定科目不再擠壓。
- Production 已由後續 `0.2.76` 接續，仍需重新部署並做實際登入、報支、付款、財報驗收。

## 0.2.71 重點

- Supabase schema/RPC 已直接套用到 project `imlmclalgbfxhhnpsyam`，不再只停在本機 migrations。
- 已清理 2 組未核銷、未配對的重複銀行流水，並建立 `bank_statement_transactions_dedupe_key` 唯一索引。
- 已套用 vouchers manager update scope、`profiles.role` `super_admin` constraint，以及報支/會計/付款/主管 atomic RPC。
- 已收斂 atomic voucher RPC 權限：`authenticated` 可執行，`anon` 不可執行。
- Production 已由後續 `0.2.76` 接續，仍需重新部署並做實際登入、報支、付款、財報驗收。

## 0.2.70 重點

- 會計審核改走 `approve_voucher_review_by_accounting` RPC，明細逐列科目、付款人、備註、核准狀態、預算與 workflow log 同一交易完成。
- 0.2.70 曾將付款設定改走 `save_voucher_payment_assignment` RPC；0.2.90 已由逐項 `save_voucher_payment_splits` 正式取代。
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
- 部署動作依使用者指示保留手動執行；目前需部署 `0.2.99`。


- serverless API 已集中使用 `api/_supabaseServer.js` 驗證 Supabase admin key、登入 session 與角色。
- `/api/invite`、`/api/reset-password`、`/api/notify-payee`、`/api/scan-receipt`、`/api/classify`、`/api/parse-bank-statement` 已清除壞碼訊息。
- 付款通知 API 已限制只有會計與管理角色可觸發。
- AI 科目分類已補強，車馬費、住宿費、軟體授權等不應再一律落到雜項支出。
- 付款通知、AI 憑證掃描與 AI 科目分類 API 已統一支援 `SUPABASE_SECRET_KEY`。
- Vercel production 歷史檢查為 `0.2.62` `READY`；目前 `0.2.99` 仍需由使用者推送／部署後重新確認。
- `docs/TASKS_PENDING.md` 已整理為單一待辦清單，完成項目移至 completed。
- AR 客戶、發票、信用控管、收款反轉、帳齡及跨幣別收款均已完成；`TASK-022` 只保留正式環境真實角色端到端驗收。
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

先執行隱私與機密檢查：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/tools/check-public-upload.ps1
```

建議直接產生安全上傳暫存區：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/tools/prepare-public-upload.ps1
```

成功後只上傳 `.release-upload/` **裡面的內容**，不要上傳原工作目錄，也不要把 `.release-upload` 當成 repository 的最外層資料夾。

不要把整個工作目錄拖進 GitHub。Vercel 執行必要內容：

- `api/`
- `css/`
- `scripts/`
- `src/`
- `index.html`
- `package.json`

版本與維護紀錄建議一併上傳：

- `docs/`
- `tools/sql/`
- `tools/tests/`，但排除 `tools/tests/private-invoice-samples/`
- `.env.example`
- `.gitignore`
- `CHANGELOG.md`
- `README.md`

本專案的 Supabase schema/RPC 由管理連線直接套用；依目前部署方式，`supabase/migrations/` 不需要上傳 GitHub 或由 Vercel 執行。本機 `tools/sql/` 只保留匿名化的參考 SQL 與回歸測試。

不要上傳：

- `.env`、`.env.local`、`.env.*.local`
- `.vercel/`、`.netlify/`
- `node_modules/`
- `.tmp-*` 截圖或 smoke-test 暫存資料夾
- `.release-upload/` 本身只是本機安全選檔暫存區，不納入 repository
- `tools/tests/private-invoice-samples/`、`private-data/`、`uploads/`、`attachments/`
- 真實發票／收據圖片、銀行對帳單、薪資或交易匯出檔、資料庫備份
- 一般圖片與 Office 文件預設也被阻擋；未來公開 UI 資產需經人工確認後再以單檔例外加入
- Google Drive folder ID、OAuth token、client secret 或內部 Git server 位址
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
- 發票真實模型樣本與 Google Drive 私有歸檔仍待驗收。




