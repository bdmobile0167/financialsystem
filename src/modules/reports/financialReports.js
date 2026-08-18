import supabase from '../../../../scripts/supabaseClient.js';
import { showMessage, formatTwd, getStatusBadge, downloadJsonFile, setText } from '../utils/uiHelpers.js';
import {
  summarizeTransactions,
  buildJournal,
  buildIncomeStatement,
  buildBalanceSheet,
  buildCashflowStatement,
  buildEquityStatement,
  buildTrialBalance,
  buildFundraisingSnapshot,
  fetchAccountBalancesByCode,
  getEquityAnalysis
} from '../../../../scripts/reports.js';
import { fetchIfrsAdjustments, createIfrsAdjustment, approveIfrsAdjustment, reverseIfrsAdjustment, deleteIfrsAdjustmentDraft } from '../ifrsAdjustments/ifrsAdjustmentsApi.js';
import { fetchFinancialReportNotes, updateFinancialReportNote } from '../notes/financialNotesApi.js';

let fundraisingSnapshot = { paidInCapital: 0, retainedEarnings: 0, totalEquity: 0, cashBalance: 0, monthlyRevenue: 0, monthlyExpense: 0 };

function getReportPeriodTransactions() {
  const startDateInput = document.getElementById('reportPeriodStart');
  const endDateInput = document.getElementById('reportPeriodEnd');

  const startDate = startDateInput ? startDateInput.value : '';
  const endDate = endDateInput ? endDateInput.value : '';

  let txs = window.state.transactions || [];

  if (startDate && startDate.trim() !== '') {
    txs = txs.filter(tx => tx.date >= startDate);
  }
  if (endDate && endDate.trim() !== '') {
    txs = txs.filter(tx => tx.date <= endDate);
  }

  return txs;
}

function renderTable(id, rows) {
  const table = document.getElementById(id);
  if (!table) return;

  table.innerHTML =
    '<thead><tr><th>會計科目 / 項目</th><th>金額</th><th>代碼</th></tr></thead><tbody></tbody>';

  const body = table.querySelector('tbody');

  if (rows && !Array.isArray(rows) && rows.type === 'structured') {
    let htmlContent = '';

    rows.sections.forEach(section => {
      htmlContent += `
        <tr class="section-header">
          <td colspan="3" style="font-weight: bold; background-color: #f8fafc; padding-top: 10px;">${section.title}</td>
        </tr>
      `;

      if (section.subsections) {
        section.subsections.forEach(sub => {
          htmlContent += `
            <tr class="sub-header">
              <td colspan="3" style="font-weight: 600; padding-left: 15px; color: #475569;">↳ ${sub.title}</td>
            </tr>
          `;
          sub.items.forEach(([label, amount, code = '-']) => {
            htmlContent += `
              <tr>
                <td style="padding-left: 30px;">${label}</td>
                <td style="text-align: right;">${Number(amount || 0).toLocaleString()}</td>
                <td style="color: #64748b; font-size: 12px;">${code}</td>
              </tr>
            `;
          });
          htmlContent += `
            <tr style="border-bottom: 1px dashed #cbd5e1;">
              <td style="padding-left: 15px; font-weight: 600;">${sub.title}小計</td>
              <td style="text-align: right; font-weight: 600;">${Number(sub.subtotal || 0).toLocaleString()}</td>
              <td>-</td>
            </tr>
          `;
        });
        htmlContent += `
          <tr style="border-top: 2px solid #0f172a; font-weight: bold;">
            <td>${section.title}總計</td>
            <td style="text-align: right;">${Number(section.total || 0).toLocaleString()}</td>
            <td>-</td>
          </tr>
        `;
      }
      else if (section.items) {
        section.items.forEach(([label, amount, code = '-']) => {
          htmlContent += `
            <tr>
              <td style="padding-left: 20px;">${label}</td>
              <td style="text-align: right;">${Number(amount || 0).toLocaleString()}</td>
              <td style="color: #64748b; font-size: 12px;">${code}</td>
            </tr>
          `;
        });
        htmlContent += `
          <tr style="border-top: 1px solid #cbd5e1; font-weight: bold;">
            <td style="padding-left: 10px;">${section.title}小計</td>
            <td style="text-align: right;">${Number(section.subtotal || 0).toLocaleString()}</td>
            <td>-</td>
          </tr>
        `;
      }
    });

    if (rows.netProfit !== undefined) {
      htmlContent += `
        <tr style="border-top: 2px double #0f172a; font-weight: bold; background-color: #f1f5f9;">
          <td>本期淨利 (Net Profit)</td>
          <td style="text-align: right; color: ${rows.netProfit >= 0 ? '#16a34a' : '#dc2626'};">${Number(rows.netProfit || 0).toLocaleString()}</td>
          <td>-</td>
        </tr>
      `;
    }

    body.innerHTML = htmlContent;
    return;
  }

  if (!Array.isArray(rows)) {
    console.error("renderTable() 接收到的不是陣列：", rows);
    body.innerHTML = `
      <tr>
        <td colspan="3" style="color:red">資料格式錯誤</td>
      </tr>
    `;
    return;
  }

  rows.forEach(item => {
    if (!Array.isArray(item)) return;
    const [label, amount] = item;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${label}</td>
      <td style="text-align: right;">${Number(amount || 0).toLocaleString()}</td>
      <td>-</td>
    `;
    body.appendChild(tr);
  });
}

function renderReportLetterhead(elementId, reportTitle) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const start = document.getElementById('reportPeriodStart')?.value;
  const end = document.getElementById('reportPeriodEnd')?.value;
  const periodText = start && end ? `${start} 至 ${end}` : (start ? `${start} 起` : (end ? `截至 ${end}` : '全部歷史資料'));
  const today = new Date().toLocaleDateString('zh-TW');
  const company = window.state.companyInfo || {};
  el.innerHTML = `
    <div class="report-company">${company.companyNameZh || '（尚未設定公司名稱）'}</div>
    <div class="report-meta">統一編號：${company.taxId || '-'}</div>
    <div class="report-title">${reportTitle}</div>
    <div class="report-period">期間：${periodText}</div>
    <div class="report-printdate">列印日期：${today}</div>
  `;
}

function renderReportSignature(elementId) {
  const container = document.getElementById(elementId);
  if (!container) return;

  const customDate = document.getElementById('reportPeriodEnd')?.value || new Date().toISOString().split('T')[0];

  container.innerHTML = `
    <div class="report-signature-row">
      <div class="sign-box">
        製表人：經辦
      </div>
      <div class="sign-box">
        會計主管：黃超明
      </div>
      <div class="sign-box">
        單位主管：黃超明
      </div>
      <div class="sign-box">
        日期：${customDate}
      </div>
    </div>
  `;
}

function applyReportPeriodPreset(preset) {
  const year = new Date().getFullYear();
  const startInput = document.getElementById('reportPeriodStart');
  const endInput = document.getElementById('reportPeriodEnd');
  if (!startInput || !endInput) return;
  const pad = (n) => String(n).padStart(2, '0');
  const today = new Date();
  const ranges = {
    year: [`${year}-01-01`, `${year}-12-31`],
    q1: [`${year}-01-01`, `${year}-03-31`],
    q2: [`${year}-04-01`, `${year}-06-30`],
    q3: [`${year}-07-01`, `${year}-09-30`],
    q4: [`${year}-10-01`, `${year}-12-31`],
    month: [`${year}-${pad(today.getMonth() + 1)}-01`, today.toISOString().slice(0, 10)],
    all: ['', '']
  };
  const [start, end] = ranges[preset] || ['', ''];
  startInput.value = start;
  endInput.value = end;
  renderReports();
}

function renderFundraisingSimulation() {
  const resultsEl = document.getElementById('fsResults');
  if (!resultsEl) return;

  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('fsPaidInCapital', formatTwd(fundraisingSnapshot.paidInCapital));
  setText('fsRetainedEarnings', formatTwd(fundraisingSnapshot.retainedEarnings));
  setText('fsTotalEquity', formatTwd(fundraisingSnapshot.totalEquity));
  setText('fsCashBalance', formatTwd(fundraisingSnapshot.cashBalance));

  const expansionCost = Number(document.getElementById('fsExpansionCost')?.value || 0);
  const revenueGrowth = Number(document.getElementById('fsRevenueGrowth')?.value || 0);
  const bufferMonths = Number(document.getElementById('fsBufferMonths')?.value || 0);
  const preMoney = Number(document.getElementById('fsPreMoney')?.value || 0);

  const currentBurn = Math.max(0, fundraisingSnapshot.monthlyExpense - fundraisingSnapshot.monthlyRevenue);
  const newExpense = fundraisingSnapshot.monthlyExpense + expansionCost;
  const newRevenue = fundraisingSnapshot.monthlyRevenue + revenueGrowth;
  const newBurn = Math.max(0, newExpense - newRevenue);

  const currentRunway = currentBurn > 0 ? fundraisingSnapshot.cashBalance / currentBurn : null;
  const projectedRunway = newBurn > 0 ? fundraisingSnapshot.cashBalance / newBurn : null;

  const totalNeededCash = bufferMonths * newBurn;
  const neededFundraising = Math.max(0, Math.ceil(totalNeededCash - fundraisingSnapshot.cashBalance));

  const postMoney = preMoney + neededFundraising;
  const dilutionPct = postMoney > 0 && neededFundraising > 0 ? (neededFundraising / postMoney) * 100 : 0;

  resultsEl.innerHTML = `
    <div class="fundraise-result-grid">
      <div class="fundraise-result"><span>目前月淨燒錢率</span><strong>${formatTwd(currentBurn)} / 月</strong></div>
      <div class="fundraise-result"><span>目前可撐月數</span><strong>${currentRunway === null ? '現金流為正' : currentRunway.toFixed(1) + ' 個月'}</strong></div>
      <div class="fundraise-result"><span>擴張後月淨燒錢率</span><strong>${formatTwd(newBurn)} / 月</strong></div>
      <div class="fundraise-result"><span>擴張後可撐月數</span><strong>${projectedRunway === null ? '現金流為正' : projectedRunway.toFixed(1) + ' 個月'}</strong></div>
      <div class="fundraise-result highlight"><span>建議募資金額</span><strong>${formatTwd(neededFundraising)}</strong></div>
      <div class="fundraise-result"><span>投後估值 (Post-money)</span><strong>${formatTwd(postMoney)}</strong></div>
      <div class="fundraise-result"><span>預估股權稀釋比例</span><strong>${dilutionPct.toFixed(1)}%</strong></div>
    </div>
  `;
}

function adjStatusChip(status) {
  const map = {
    draft: ['adj-status-draft', '草稿'],
    approved: ['adj-status-approved', '已核准'],
    reversed: ['adj-status-reversed', '已沖銷']
  };
  const [cls, label] = map[status] || ['adj-status-draft', status];
  return `<span class="adj-status-chip ${cls}">${label}</span>`;
}

async function renderIfrsAdjustments() {
  const wrap = document.getElementById('ifrsAdjustmentsTableWrap');
  if (!wrap) return;
  try {
    const adjustments = await fetchIfrsAdjustments();
    const badge = document.getElementById('adjustmentsCountBadge');
    if (badge) badge.textContent = `共 ${adjustments.length} 筆`;

    if (adjustments.length === 0) {
      wrap.innerHTML = `<p class="muted">目前尚無 IFRS 調整分錄。</p>`;
      return;
    }

    wrap.innerHTML = `
      <table class="adj-table">
        <thead>
          <tr>
            <th>單號</th><th>準則規範</th><th>調整原因</th><th>日期</th>
            <th>借方分錄</th><th>貸方分錄</th><th>狀態</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${adjustments.map(adj => {
            const debitLines = (adj.ifrs_adjustment_lines || []).filter(l => Number(l.debit_amount) > 0);
            const creditLines = (adj.ifrs_adjustment_lines || []).filter(l => Number(l.credit_amount) > 0);
            const fmtLines = (lines, key) => lines.map(l =>
              `${l.account?.code || ''} ${l.account?.name || ''}<br/><span class="mono">${formatTwd(l[key])}</span>`
            ).join('<br/>');

            let actions = '';

            if (adj.status === 'draft') {
              actions = `
                <button type="button" class="secondary approve-adj-btn" data-id="${adj.id}" style="padding:4px 8px; font-size:11px;">核准</button>
                <button type="button" class="secondary delete-adj-btn" data-id="${adj.id}" style="padding:4px 8px; font-size:11px; color:#b91c1c;">刪除草稿</button>
              `;
            } else if (adj.status === 'approved') {
              actions = `<button type="button" class="secondary reverse-adj-btn" data-id="${adj.id}" style="padding:4px 8px; font-size:11px;">沖銷</button>`;
            } else {
              actions = `<span class="muted" style="font-size:11px;">${adj.reversal_reason || ''}</span>`;
            }

            return `
              <tr>
                <td class="mono">${adj.adjustment_no || '-'}</td>
                <td>${adj.standard}</td>
                <td>${adj.reason}</td>
                <td class="mono">${adj.entry_date}</td>
                <td>${fmtLines(debitLines, 'debit_amount')}</td>
                <td>${fmtLines(creditLines, 'credit_amount')}</td>
                <td>${adjStatusChip(adj.status)}</td>
                <td>${actions}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    wrap.innerHTML = `<p style="color:#b91c1c;">讀取失敗：${err.message}</p>`;
  }
}

async function renderFinancialNotes() {
  const wrap = document.getElementById('financialNotesWrap');
  if (!wrap) return;
  try {
    const notes = await fetchFinancialReportNotes();
    const balances = await fetchAccountBalancesByCode(['1101', '1102', '1141', '1601', '1602']);
    const dataDrivenValue = {
      note4: `NT$ ${(balances['1101'] + balances['1102']).toLocaleString()}`,
      note5: `NT$ ${balances['1141'].toLocaleString()}（尚未建立單獨的 IFRS 9 預期信用損失備抵科目）`,
      note6: `NT$ ${(balances['1601'] + balances['1602']).toLocaleString()}（固定資產原始成本扣除累計折舊後淨額）`
    };

    wrap.innerHTML = notes.map(note => `
      <div class="note-card" data-note-key="${note.note_key}">
        <div class="note-card-head">
          <span class="note-tag">${note.note_label}</span>
          <h5>${note.title}</h5>
          <button type="button" class="note-edit-btn no-print" data-key="${note.note_key}">編輯</button>
        </div>
        ${note.is_data_driven ? `<div class="note-card-value">${dataDrivenValue[note.note_key] || ''}</div>` : ''}
        <div class="note-view">
          <p>${(note.content || '（尚未填寫，請點選「編輯」補上說明）').replace(/</g, '&lt;')}</p>
        </div>
      </div>
    `).join('');
  } catch (err) {
    wrap.innerHTML = `<p style="color:#b91c1c;">讀取失敗：${err.message}</p>`;
  }
}

async function renderJournalFiltered() {
  const keyword = (document.getElementById('journalSearchInput')?.value || '').trim().toLowerCase();
  const journalBody = document.getElementById('journalTableBody');
  if (!journalBody) return;

  try {
    const journal = await buildJournal(window.state.transactions || []);

    const filtered = journal.filter(row => {
      if (!keyword) return true;
      return [row.summary, row.bank, row.debitAccount, row.creditAccount, row.voucher]
        .some(field => (field || '').toLowerCase().includes(keyword));
    });

    journalBody.innerHTML = '';
    if (!filtered.length) {
      journalBody.innerHTML = '<tr><td colspan="9" class="muted">沒有符合條件的分錄。</td></tr>';
      return;
    }

    filtered.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="white-space:nowrap;">${row.date}</td>
        <td>${row.summary}</td>
        <td>${row.bank}</td>
        <td><span style="color:#1d4ed8; font-weight:600;">借</span> ${row.debitAccount}</td>
        <td style="text-align:right; font-variant-numeric:tabular-nums;">${Number(row.debitAmount).toLocaleString()}</td>
        <td><span style="color:#b45309; font-weight:600;">貸</span> ${row.creditAccount}</td>
        <td style="text-align:right; font-variant-numeric:tabular-nums;">${Number(row.creditAmount).toLocaleString()}</td>
        <td>${row.voucher || '-'}</td>
        <td><span class="badge success">${row.status}</span></td>
      `;
      journalBody.appendChild(tr);
    });
  } catch (err) {
    console.error('渲染日記帳失敗:', err);
    journalBody.innerHTML = '<tr><td colspan="9" class="muted">載入失敗</td></tr>';
  }
}

function switchReportTab(tab) {
  if (!tab) return;
  document.querySelectorAll('.report-tab-btn').forEach(btn => {
    btn.classList.toggle('active-tab', btn.dataset.reportTab === tab);
  });
  document.querySelectorAll('.report-cards-stack .report-card[data-report-tab]').forEach(card => {
    card.classList.toggle('active-tab', card.dataset.reportTab === tab);
  });
  const grid = document.getElementById('reportCardsGrid');
  const label = document.getElementById('showAllReportsBtnLabel');
  const showAllBtn = document.getElementById('showAllReportsBtn');
  if (grid && grid.classList.contains('show-all-mode')) {
    grid.classList.remove('show-all-mode');
    if (label) label.textContent = '全部檢視';
    if (showAllBtn) showAllBtn.classList.remove('is-active');
  }
}

async function renderReports() {
  let periodTx = getReportPeriodTransactions();
  const startDate = document.getElementById('reportPeriodStart')?.value || null;
  const endDate = document.getElementById('reportPeriodEnd')?.value || null;

  if (window.state.currentProjectId && window.state.currentProjectId !== 'all') {
    periodTx = periodTx.filter(tx => tx.project_id === window.state.currentProjectId);
  }

  await renderIncomeStatement();
  await renderBalanceSheet();
  await renderCashflowStatement();
  await renderEquityStatement();
  await renderTrialBalance();

  fundraisingSnapshot = await buildFundraisingSnapshot(periodTx, startDate, endDate);
  renderFundraisingSimulation();
  renderIfrsAdjustments();
  renderFinancialNotes();

  const analysis = getEquityAnalysis(periodTx);
  const note = document.getElementById('fundraisingNote');
  if (note) {
    note.textContent = `現金水位：${analysis.cashBalance.toLocaleString()}｜可撐月數：${analysis.cashRunwayMonths ? analysis.cashRunwayMonths.toFixed(1) + ' 個月' : '尚無支出紀錄'}｜建議：${analysis.fundraisingSuggestion}`;
  }

  renderJournalFiltered();

  const body = document.getElementById('dashboardTableBody');
}

async function renderIncomeStatement() {
  const periodTx = getReportPeriodTransactions();
  const startDate = document.getElementById('reportPeriodStart')?.value || null;
  const endDate = document.getElementById('reportPeriodEnd')?.value || null;

  if (window.state.currentProjectId && window.state.currentProjectId !== 'all') {
    periodTx = periodTx.filter(tx => tx.project_id === window.state.currentProjectId);
  }

  renderReportLetterhead('incomeLetterhead', '損益表');
  const incomeStatement = await buildIncomeStatement(periodTx, startDate, endDate);
  renderTable('incomeTable', incomeStatement);
  renderReportSignature('incomeSignature');
}

async function renderBalanceSheet() {
  const periodTx = getReportPeriodTransactions();
  const startDate = document.getElementById('reportPeriodStart')?.value || null;
  const endDate = document.getElementById('reportPeriodEnd')?.value || null;

  if (window.state.currentProjectId && window.state.currentProjectId !== 'all') {
    periodTx = periodTx.filter(tx => tx.project_id === window.state.currentProjectId);
  }

  renderReportLetterhead('balanceLetterhead', '資產負債表');
  const balanceSheet = await buildBalanceSheet(periodTx, startDate, endDate);
  renderTable('balanceTable', balanceSheet);
  renderReportSignature('balanceSignature');
}

async function renderCashflowStatement() {
  const periodTx = getReportPeriodTransactions();
  const startDate = document.getElementById('reportPeriodStart')?.value || null;
  const endDate = document.getElementById('reportPeriodEnd')?.value || null;

  if (window.state.currentProjectId && window.state.currentProjectId !== 'all') {
    periodTx = periodTx.filter(tx => tx.project_id === window.state.currentProjectId);
  }

  renderReportLetterhead('cashflowLetterhead', '現金流量表');
  const cashflowStatement = await buildCashflowStatement(periodTx, startDate, endDate);
  renderTable('cashflowTable', cashflowStatement);
  renderReportSignature('cashflowSignature');
}

async function renderEquityStatement() {
  const periodTx = getReportPeriodTransactions();
  const startDate = document.getElementById('reportPeriodStart')?.value || null;
  const endDate = document.getElementById('reportPeriodEnd')?.value || null;

  if (window.state.currentProjectId && window.state.currentProjectId !== 'all') {
    periodTx = periodTx.filter(tx => tx.project_id === window.state.currentProjectId);
  }

  renderReportLetterhead('equityLetterhead', '權益變動表');
  const equityStatement = await buildEquityStatement(periodTx, startDate, endDate);
  renderTable('equityTable', equityStatement);
  renderReportSignature('equitySignature');
}

async function renderTrialBalance() {
  const periodTx = getReportPeriodTransactions();
  const startDate = document.getElementById('reportPeriodStart')?.value || null;
  const endDate = document.getElementById('reportPeriodEnd')?.value || null;

  if (window.state.currentProjectId && window.state.currentProjectId !== 'all') {
    periodTx = periodTx.filter(tx => tx.project_id === window.state.currentProjectId);
  }

  renderReportLetterhead('trialLetterhead', '試算表');
  const includeAdjustments = document.getElementById('includeIfrsAdjustmentsToggle')?.checked || false;
  const trialBalance = await buildTrialBalance(periodTx, startDate, endDate, includeAdjustments);
  renderTable('trialTable', trialBalance);
  renderReportSignature('trialSignature');
}

async function renderFundraisingSnapshot() {
  const periodTx = getReportPeriodTransactions();
  const startDate = document.getElementById('reportPeriodStart')?.value || null;
  const endDate = document.getElementById('reportPeriodEnd')?.value || null;

  if (window.state.currentProjectId && window.state.currentProjectId !== 'all') {
    periodTx = periodTx.filter(tx => tx.project_id === window.state.currentProjectId);
  }

  fundraisingSnapshot = await buildFundraisingSnapshot(periodTx, startDate, endDate);
  renderFundraisingSimulation();
}

async function exportReportsToExcel() {
  showMessage('正在產生 Excel，請稍候…');
  const XLSX = await import('https://esm.sh/xlsx@0.18.5');

  const periodTx = getReportPeriodTransactions();
  const company = window.state.companyInfo || {};
  const start = document.getElementById('reportPeriodStart')?.value;
  const end = document.getElementById('reportPeriodEnd')?.value;
  const periodText = start && end ? `${start} 至 ${end}` : (start ? `${start} 起` : (end ? `截至 ${end}` : '全部歷史資料'));
  const printDate = new Date().toLocaleDateString('zh-TW');

  const wb = XLSX.utils.book_new();

  function addStatementSheet(sheetName, title, rows) {
    const aoa = [
      [company.companyNameZh || '（尚未設定公司名稱）'],
      [`統一編號：${company.taxId || '-'}`],
      [title],
      [`期間：${periodText}`],
      [`列印日期：${printDate}`],
      [],
      ['項目', '金額'],
      ...rows.map(([label, amount]) => [label, amount])
    ];
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    sheet['!cols'] = [{ wch: 26 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, sheet, sheetName);
  }

  addStatementSheet('損益表', '損益表', await buildIncomeStatement(periodTx));
  addStatementSheet('資產負債表', '資產負債表', await buildBalanceSheet(periodTx));
  addStatementSheet('現金流量表', '現金流量表', await buildCashflowStatement(periodTx));
  addStatementSheet('權益變動表', '權益變動表', await buildEquityStatement(periodTx));

  const journal = await buildJournal(periodTx);
  const journalAoa = [
    ['日期', '摘要', '銀行', '借方科目', '借方金額', '貸方科目', '貸方金額', '憑證', '狀態'],
    ...journal.map(row => [row.date, row.summary, row.bank, row.debitAccount, row.debitAmount, row.creditAccount, row.creditAmount, row.voucher || '-', row.status])
  ];
  const journalSheet = XLSX.utils.aoa_to_sheet(journalAoa);
  journalSheet['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, journalSheet, '會計分錄');

  const fileName = `財務報表_${start || '全部'}_${end || '至今'}.xlsx`;
  XLSX.writeFile(wb, fileName);
  showMessage('Excel 已匯出完成。');
}

export {
  renderReports,
  switchReportTab,
  renderIncomeStatement,
  renderBalanceSheet,
  renderCashflowStatement,
  renderEquityStatement,
  renderTrialBalance,
  renderFundraisingSnapshot,
  exportReportsToExcel,
  renderReportLetterhead,
  renderReportSignature,
  applyReportPeriodPreset
};
