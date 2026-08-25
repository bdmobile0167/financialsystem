# 財務管理系統

目前本機版本：`0.2.39`

這是部署於 Vercel、以 Supabase 為後端的財務管理系統。功能包含登入與權限、報支簽核、銀行帳戶與勾稽、專案預算、會計分錄、四大財報、IFRS 調整、通知及帳號管理。

## 目前狀態

- GitHub：`bdmobile0167/financialsystem`
- Vercel 專案：`financialsystem`
- Supabase project ref：`imlmclalgbfxhhnpsyam`
- 正式本機目錄：`C:\Users\BDPM\Desktop\bdm0167\表格自動化\netlify`
- 本機版本 `0.2.39` 尚未推送前，GitHub／Vercel 仍顯示 `0.2.16`。

## 本輪更新

- 報支與補件重送的付款人欄位改為由申請人自行填寫姓名/公司名稱與身分證/統編，不再讓一般員工或主管查詢所有付款人主檔。
- Supabase `payees` 與 `payment_recipients` RLS 已收斂為會計、管理員、超級管理員才可讀寫，付款人個資不再開放全員讀取。
- 部門管理新增刪除前關聯檢查，避免刪到仍被使用者、專案、預算或憑證使用中的部門。
- 移除設定頁舊的「使用者核准」與「匯出交易 JSON」區塊，保留正式帳號邀請與 CPA 審計包匯出。
- 事業項目與董監名單改為可編輯表格，管理/會計可新增、修改、刪除並寫回 Supabase。
- 儲存董監名單時會以出資合計同步更新已投入股本。
- 密碼設定補上送出鎖、最小長度、autocomplete 與成功後清空欄位。
- 預算管理納入 Audit Trail：部門預算申請、核准、退件、部門預算新增/調整/刪除會寫入 `audit_logs`。
- Audit Trail 畫面新增預算申請與部門預算動作篩選，並合併顯示 workflow log 與 system audit log。
- Vercel invite/reset-password API 改支援 `SUPABASE_SECRET_KEY`，並會拒絕 publishable/anon key；舊版 JWT key 需解碼為 `service_role` 才可作為 Admin API key。
- 邀請與重設密碼 API 允許 `admin` / `super_admin` 執行。
- Supabase 新增資料表 RLS 已改成 init-plan friendly policy，並補齊 FK index / 拆分重疊 policy。
- 近期新增 SECURITY DEFINER helper 已撤回 `public` / `anon` 直接 execute 權限。
- Dashboard CSS 改用既有色彩 token，並補齊 1024 / 768 / 390 viewport 規則。
- 付款人主檔新增付款明細查詢，可看到付款日期、付款憑證、會計憑證、出款銀行與金額。
- 付款管理新增員工薪資付款批次，可一次勾選多位付款人輸入薪資、勞保、健保與勞退，並自動產生薪資付款憑證。
- 付款管理的所有付款人改讀 Supabase `payees` 主檔，可新增與編輯付款人銀行/聯絡明細。
- 會計憑證與付款憑證新增數字流水號，方便排序與查帳。
- 部門預算申請改為明細項目合計審核，部門端不顯示銀行帳戶。
- 憑證中心新增專案、類別與日期篩選，並保留 RLS 權限限制。
- TASK-011 開始拆分 navigation：`renderHeader()`、`renderTabs()` 已移至 `src/modules/navigation/navigation.js`。
- TASK-009 補強登入頁 mobile viewport：登入/強制改密碼卡片改為 flex responsive，不再依賴 grid min-content。
- 完成本機 HTTP smoke：首頁、`scripts/ui.js` 與 navigation module 可正常 200 載入。
- 完成 P1 未引用程式清理，移除未接入 runtime 的破損/空殼模組。
- 財報正式維持 `scripts/reports.js` 作為計算來源，`scripts/ui.js` 保留現行財報 UI 協調。
- 管理員重設密碼改走 Supabase Auth Admin API，避免只寫入 `profiles` 造成重新登入密碼錯誤。
- 報支申請直接選擇付款人，核准後自動帶入付款管理。
- 付款管理可再次確認並即時更新收款帳號，付款後產生獨立 `PAY-...` 憑證。
- 交易管理憑證與付款憑證分離，手動交易直接保存到 Supabase。
- 財務、公司及付款人資料不寫入程式或 localStorage。
- 新增付款管理：會計核准後待付款、付款前編輯、付款後入帳與專案通知。
- 新增會計／管理員專用收款人銀行資訊及付款清單 Excel 匯出。
- 交易清單正式改讀 Supabase，修正 1,000 元流水漏列。
- 修正帳號既有權限勾選狀態與邀請 API 管理員判定。
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
- 保留較新的權限、交易與傳票模組；未接入 runtime 的 Auth Provider／Repository 空殼已於 0.2.29 清理。
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
