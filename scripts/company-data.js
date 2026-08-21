// ==========================================
// 1. 全部公司清單與詳細資料（供前端介面列表與檢視使用）
// ==========================================
export const COMPANIES_DATA = [
  {
    id: "comp_001",
    info: {
      companyNameZh: '開發科技股份有限公司',
      companyNameEn: 'Development Tech Co., Ltd.',
      address: '(110)台北市信義區松仁路300號',
      phone: '02-2345-6789',
      taxId: '12345678',
      precheckNumber: 'A20250626001',
      foreignInvestment: 0,
      singlePersonCompany: 0,
      chinaInvestment: 0,
      plannedOpenDate: '2025-07-01',
      totalCapital: 10000000,
      boardCount: 3,
      representativeName: '張三',
      articlesDate: '2025-06-20',
      capitalCash: 5000000,
      capitalProperty: 3000000,
      capitalTechnology: 2000000,
      capitalMergeNew: 3000000,
      mergedCompanyBaseDate: '2025-08-01',
      mergedCompanyTaxId: '98765432',
      mergedCompanyName: '合併公司股份有限公司'
    },
    businessItems: [
      { code: 'A1820', item: 'AI伺服器' },
      { code: 'B3342', item: '醫療軟體' },
      { code: 'C5580', item: '監測儀' }
    ],
    directorsShareholders: [
      { role: '執行長', name: '李曉明', idNumber: 'B223755666', amount: 400000, address: '台中市西屯區' },
      { role: '監察', name: '張曉嵐', idNumber: 'R932012338', amount: 500000, address: '台北市文山區' }
    ]
  }
  // 之後若有第二家、第三家公司，可直接以相同結構往下新增物件
];

// ==========================================
// 2. 欄位對應與對照設定（維持不變，供 Word 產生器對應使用）
// ==========================================
export const STRUCTURE_SETTINGS = [
  { field: '公司名稱（中文）', keyword: '中文', tableNumber: 0, direction: '水平', position: '右側', dataType: '單一值' },
  { field: '公司名稱（英文）', keyword: '(章程所訂)外文', tableNumber: 0, direction: '水平', position: '右側', dataType: '單一值' },
  { field: '公司地址', keyword: '(郵遞區號)公司所在地\n(含鄉鎮市區村里)', tableNumber: 0, direction: '水平', position: '右側', dataType: '單一值' },
  { field: '公司電話', keyword: '公司聯絡電話', tableNumber: 0, direction: '水平', position: '右側', dataType: '單一值' },
  { field: '公司統編', keyword: '公司統一編號', tableNumber: 0, direction: '水平', position: '右側', dataType: '單一值' },
  { field: '公司預查編號', keyword: '公司預查編號', tableNumber: 0, direction: '水平', position: '右側', dataType: '單一值' },
  { field: '董事人數', keyword: '董事人數', tableNumber: 0, direction: '水平', position: '右側', dataType: '單一值' },
  { field: '代表人姓名', keyword: '代表人姓', tableNumber: 0, direction: '水平', position: '右側', dataType: '單一值' },
  { field: '公司章程訂定日期', keyword: '公司章程訂定日期', tableNumber: 0, direction: '水平', position: '右側', dataType: '日期' },
  { field: '資本明細-現金', keyword: '1.現金', tableNumber: 0, direction: '水平', position: '右側', dataType: '單一值' },
  { field: '資本明細-財產', keyword: '2.財產', tableNumber: 0, direction: '水平', position: '右側', dataType: '單一值' },
  { field: '資本明細-技術', keyword: '3.技術', tableNumber: 0, direction: '水平', position: '右側', dataType: '單一值' },
  { field: '資本明細-合併新設', keyword: '4.合併新設', tableNumber: 0, direction: '水平', position: '右側', dataType: '單一值' },
  { field: '被合併公司資料明細-合併基準日', keyword: '合併基準日', tableNumber: 0, direction: '垂直', position: '下方', dataType: '表格型' },
  { field: '被合併公司資料明細-統一編號', keyword: '統一編號', tableNumber: 0, direction: '垂直', position: '下方', dataType: '表格型' },
  { field: '被合併公司資料明細-公司名稱', keyword: '公司名稱', tableNumber: 0, direction: '垂直', position: '下方', dataType: '表格型' },
  { field: '僑外投資事業', keyword: '僑外投資事業', tableNumber: 0, direction: '水平', position: '右側', dataType: '打勾' },
  { field: '一人公司', keyword: '一人公司', tableNumber: 0, direction: '水平', position: '右側', dataType: '打勾' },
  { field: '陸資', keyword: '陸資', tableNumber: 0, direction: '水平', position: '右側', dataType: '打勾' },
  { field: '資本總額', keyword: '資本總額', tableNumber: 0, direction: '水平', position: '右側', dataType: '單一值' }
];

// Compatibility exports (DEPRECATED).
// Frontend should fetch company data from Supabase via `companyContext.js`.
// These are intentionally empty to discourage runtime reliance on local hard-coded data.
export const COMPANY_INFO = {};
export const OPTION_LIST = [];
export const STANDARDIZED_STRUCTURE_SETTINGS = [];