# 變更紀錄

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
