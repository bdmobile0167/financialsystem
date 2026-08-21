import supabase from '../../../scripts/supabaseClient.js';

export function renderCompanyData() {
  const container = document.getElementById('companyInfoContent');
  if (!container) return;
  const info = window.state.companyInfo || {};
  const entries = [
    ['公司名稱（中文）', info.companyNameZh],
    ['公司名稱（英文）', info.companyNameEn],
    ['公司地址', info.address],
    ['公司電話', info.phone],
    ['統一編號', info.taxId],
    ['預查編號', info.precheckNumber],
    ['預定開業日期', info.plannedOpenDate],
    ['資本總額', info.totalCapital?.toLocaleString()],
    ['董事人數', info.boardCount],
    ['代表人', info.representativeName],
    ['章程訂定日期', info.articlesDate],
    ['資本-現金', info.capitalCash?.toLocaleString()],
    ['資本-財產', info.capitalProperty?.toLocaleString()],
    ['資本-技術', info.capitalTechnology?.toLocaleString()],
    ['資本-合併新設', info.capitalMergeNew?.toLocaleString()],
    ['合併公司名稱', info.mergedCompanyName],
    ['合併公司統編', info.mergedCompanyTaxId],
    ['合併基準日', info.mergedCompanyBaseDate]
  ];
  container.innerHTML = entries
    .map(([label, value]) => `<div class="info-row"><strong>${label}</strong><span>${value ?? '-'}</span></div>`)
    .join('');
}

export function fillCompanyInfoForm() {
  const info = window.state.companyInfo || {};
  const setVal = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
  };
  setVal('companyNameZh', info.companyNameZh);
  setVal('companyNameEn', info.companyNameEn);
  setVal('companyTaxId', info.taxId);
  setVal('companyPhone', info.phone);
  setVal('companyAddress', info.address);
  setVal('companyRepresentative', info.representativeName);
  setVal('companyBoardCount', info.boardCount);
  setVal('companyTotalCapital', info.totalCapital);
  setVal('companyOpenDate', info.plannedOpenDate);
}

export function renderBusinessData() {
  const container = document.getElementById('businessInfoContent');
  if (!container) return;
  const businessRows = (window.state.businessItems || []).map(item => `<li>${item.code} - ${item.item}</li>`).join('');
  const directorRows = (window.state.directorShareholders || []).map(person => `
    <li>姓名：${person.name ?? '-'} / 職務：${person.role ?? '-'} / 身分證：${person.idNumber ?? '-'} / 出資：${Number(person.amount || 0).toLocaleString()} / 地址：${person.address ?? '-'}</li>
  `).join('');
  container.innerHTML = `
    <div class="info-block">
      <h4>營業項目</h4>
      <ul>${businessRows}</ul>
    </div>
    <div class="info-block">
      <h4>董監名單</h4>
      <ul>${directorRows}</ul>
    </div>
  `;
}

export function initCompanyInfoForm() {
  const company = window.state.companyInfo || {};
  
  const setVal = (id, val) => {
  // 在 Tab 切換事件內加入這一段：
  if (tab === 'settings') {
    initCompanyInfoForm(); // 確保每次切過來時，輸入框都有最新資料
    
    // 同步帶入密碼設定區塊的登入帳號
    const emailInput = document.getElementById('passwordUserEmail');
    if (emailInput && window.state.currentUser) {
      emailInput.value = window.state.currentUser.email || '';
    }
  }  
    const el = document.getElementById(id);
    if (el) el.value = val !== undefined && val !== null ? val : '';
  };

  setVal('companyNameZh', company.companyNameZh);
  setVal('companyNameEn', company.companyNameEn);
  setVal('companyTaxId', company.taxId);
  setVal('companyPhone', company.phone);
  setVal('companyAddress', company.address);
  setVal('companyRepresentative', company.representativeName);
  setVal('companyBoardCount', company.boardCount);
  setVal('companyTotalCapital', company.totalCapital);
  setVal('companyOpenDate', company.plannedOpenDate);
}
