import { runAccountingPipeline, buildEquityAnalysis, buildCashFlowByActivity } from '../src/modules/accounting/index.js';
import { supabase } from './supabaseClient.js';
import { getCompanyInfo, getActiveCompanyId } from './companyContext.js';

export function summarizeTransactions(transactions) {
  const revenue = transactions.filter(t => t.type === '收入').reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const expense = transactions.filter(t => t.type === '支出').reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const netProfit = revenue - expense;
  return { revenue, expense, netProfit };
}

async function fetchSupabaseTrialBalance(startDate, endDate) {
  const companyId = getActiveCompanyId();
  let query = supabase.from('journal_entries').select('*');
  if (companyId) query = query.eq('company_id', companyId);
  if (startDate) query = query.gte('entry_date', startDate);
  if (endDate) query = query.lte('entry_date', endDate);
  const { data: entries, error } = await query;
  if (error) throw error;

  let accQuery = supabase.from('accounts').select('*');
  if (companyId) accQuery = accQuery.eq('company_id', companyId);
  const { data: accounts, error: accError } = await accQuery;
  if (accError) throw accError;

  const ledger = {};
  accounts.forEach(acc => { ledger[acc.id] = { account: acc, debitTotal: 0, creditTotal: 0 }; });

  entries.forEach(entry => {
    if (ledger[entry.debit_account_id]) ledger[entry.debit_account_id].debitTotal += Number(entry.debit_amount || 0);
    if (ledger[entry.credit_account_id]) ledger[entry.credit_account_id].creditTotal += Number(entry.credit_amount || 0);
  });

  const rows = Object.values(ledger)
    .filter(item => item.debitTotal > 0 || item.creditTotal > 0)
    .map(item => ({
      code: item.account.code,
      name: item.account.name,
      type: item.account.type,
      debitTotal: item.debitTotal,
      creditTotal: item.creditTotal
    }));

  return { rows };
}

export async function buildJournal(transactions = [], startDate = null, endDate = null) {
  try {
    let query = supabase
      .from('journal_entries')
      .select(`
          id,
          entry_date,
          memo,
          debit_amount,
          credit_amount,
          voucher_id,
          debit_account:accounts!journal_entries_debit_account_id_fkey(code, name),
          credit_account:accounts!journal_entries_credit_account_id_fkey(code, name),
          vouchers(voucher_no) 
      `)
      .order('entry_date', { ascending: false });
      
    if (startDate) query = query.gte('entry_date', startDate);
    if (endDate) query = query.lte('entry_date', endDate);

    const { data: journalEntries, error } = await query;
    if (error) throw error;

    // 💡 修復重複出現問題：利用 Map 以 id 作為 key 進行去重
    const uniqueEntries = Array.from(new Map(journalEntries.map(e => [e.id, e])).values());

    return uniqueEntries.map(entry => {
      // 💡 修復憑證號碼顯示：優先讀取關聯表 vouchers 的 voucher_no，沒有則顯示 id 或 '-'
      const displayVoucher = entry.vouchers?.voucher_no || entry.voucher_id || '-';

      return {
        id: entry.id,
        date: entry.entry_date,
        summary: entry.memo || '未註明',
        bank: '-',
        debitAccount: entry.debit_account ? `${entry.debit_account.code} ${entry.debit_account.name}` : '-',
        debitAmount: Number(entry.debit_amount || 0),
        creditAccount: entry.credit_account ? `${entry.credit_account.code} ${entry.credit_account.name}` : '-',
        creditAmount: Number(entry.credit_amount || 0),
        voucher: displayVoucher,
        status: '已入帳'
      };
    });
  } catch (err) {
    console.warn('日記帳讀取 Supabase 失敗，降級使用本地計算:', err.message);
    const { journalEntries: localEntries } = runAccountingPipeline(transactions);
    return localEntries.map(entry => ({
      date: entry.date, summary: entry.memo, bank: entry.bank,
      debitAccount: `${entry.debitAccountCode} ${entry.debitAccountName}`, debitAmount: entry.debitAmount,
      creditAccount: `${entry.creditAccountCode} ${entry.creditAccountName}`, creditAmount: entry.creditAmount,
      voucher: entry.voucher, status: entry.status
    }));
  }
}

export async function buildIncomeStatement(transactions, startDate = null, endDate = null) {
  try {
    const { rows } = await fetchSupabaseTrialBalance(startDate, endDate);
    
    // 依會計代碼開頭自動歸類：4開頭為營業收入，5/6開頭為營業費用
    const revenueRows = rows.filter(r => r.code.startsWith('4'));
    const expenseRows = rows.filter(r => r.code.startsWith('5') || r.code.startsWith('6'));

    const totalRevenue = revenueRows.reduce((sum, r) => sum + (r.creditTotal - r.debitTotal), 0);
    const totalExpense = expenseRows.reduce((sum, r) => sum + (r.debitTotal - r.creditTotal), 0);
    const netProfit = totalRevenue - totalExpense;

    return {
      type: 'structured',
      sections: [
        {
          title: '一、營業收入',
          items: revenueRows.map(r => [r.name, r.creditTotal - r.debitTotal, r.code]),
          subtotal: totalRevenue
        },
        {
          title: '二、營業費用',
          items: expenseRows.map(r => [r.name, r.debitTotal - r.creditTotal, r.code]),
          subtotal: totalExpense
        }
      ],
      netProfit
    };
  } catch (err) {
    console.warn('損益表讀取 Supabase 失敗，降級使用本地計算:', err.message);
    const { trialBalance } = runAccountingPipeline(transactions);
    const revenueRows = trialBalance.rows.filter(r => r.code.startsWith('4'));
    const expenseRows = trialBalance.rows.filter(r => r.code.startsWith('5') || r.code.startsWith('6'));
    const totalRevenue = revenueRows.reduce((sum, r) => sum + (r.creditTotal - r.debitTotal), 0);
    const totalExpense = expenseRows.reduce((sum, r) => sum + (r.debitTotal - r.creditTotal), 0);
    const netProfit = totalRevenue - totalExpense;

    return {
      type: 'structured',
      sections: [
        { title: '一、營業收入', items: revenueRows.map(r => [r.name, r.creditTotal - r.debitTotal, r.code]), subtotal: totalRevenue },
        { title: '二、營業費用', items: expenseRows.map(r => [r.name, r.debitTotal - r.creditTotal, r.code]), subtotal: totalExpense }
      ],
      netProfit
    };
  }
}

export async function buildBalanceSheet(transactions, startDate = null, endDate = null) {
  try {
    const companyId = getActiveCompanyId();
    const { rows } = await fetchSupabaseTrialBalance(startDate, endDate);
    
    // 1. 抓取真實銀行帳戶餘額 (僅供對帳顯示用，不參與報表平衡計算)
    let bankQ = supabase.from('bank_accounts').select('balance, opening_balance');
    if (companyId) bankQ = bankQ.eq('company_id', companyId);
    const { data: banks } = await bankQ;
    const realBankBalance = (banks || []).reduce((sum, b) => sum + Number(b.balance ?? b.opening_balance ?? 0), 0);

    // 2. 依資產負債表代碼規範進行階層篩選
    const currentAssetsRows = rows.filter(r => r.code.startsWith('1') && !r.code.startsWith('15') && !r.code.startsWith('16'));
    const nonCurrentAssetsRows = rows.filter(r => r.code.startsWith('15') || r.code.startsWith('16'));
    const currentLiabilitiesRows = rows.filter(r => r.code.startsWith('2'));
    const equityRows = rows.filter(r => r.code.startsWith('3'));

    // 💡 嚴謹的 ERP 系統作法：總資產必須嚴格使用「試算表 (分錄)」的金額加總，確保借貸平衡
    const currentAssetsTotal = currentAssetsRows.reduce((sum, r) => sum + (r.debitTotal - r.creditTotal), 0);
    const nonCurrentAssetsTotal = nonCurrentAssetsRows.reduce((sum, r) => sum + (r.debitTotal - r.creditTotal), 0);
    const totalAssets = currentAssetsTotal + nonCurrentAssetsTotal;

    const currentLiabilitiesTotal = currentLiabilitiesRows.reduce((sum, r) => sum + (r.creditTotal - r.debitTotal), 0);
    const capitalTotal = equityRows.reduce((sum, r) => sum + (r.creditTotal - r.debitTotal), 0);

    // 計算本期淨利以併入保留盈餘 (動態抓取 4, 5, 6 開頭)
    const totalRevenue = rows.filter(r => r.code.startsWith('4')).reduce((sum, r) => sum + (r.creditTotal - r.debitTotal), 0);
    const totalExpense = rows.filter(r => r.code.startsWith('5') || r.code.startsWith('6')).reduce((sum, r) => sum + (r.debitTotal - r.creditTotal), 0);
    const netProfit = totalRevenue - totalExpense;

    const totalEquity = capitalTotal + netProfit;
    const totalLiabilitiesAndEquity = currentLiabilitiesTotal + totalEquity;

    return {
      type: 'structured',
      sections: [
        {
          title: '資產 (Assets)',
          subsections: [
            { 
              title: '流動資產', 
              items: currentAssetsRows.map(r => {
                if (r.code === '1102') {
                  // 畫面上同時顯示帳面餘額與真實餘額，方便會計抓漏
                  const ledgerBalance = r.debitTotal - r.creditTotal;
                  const discrepancy = realBankBalance - ledgerBalance;
                  const note = discrepancy !== 0 ? ` (網銀實際: $${realBankBalance.toLocaleString()} / 差額: $${discrepancy.toLocaleString()})` : '';
                  return [`${r.name}${note}`, ledgerBalance, r.code];
                }
                return [r.name, r.debitTotal - r.creditTotal, r.code];
              }), 
              subtotal: currentAssetsTotal 
            },
            { title: '非流動資產', items: nonCurrentAssetsRows.map(r => [r.name, r.debitTotal - r.creditTotal, r.code]), subtotal: nonCurrentAssetsTotal }
          ],
          total: totalAssets
        },
        {
          title: '負債及權益 (Liabilities & Equity)',
          subsections: [
            { title: '流動負債', items: currentLiabilitiesRows.map(r => [r.name, r.creditTotal - r.debitTotal, r.code]), subtotal: currentLiabilitiesTotal },
            { 
              title: '權益', 
              items: [
                ...equityRows.map(r => [r.name, r.creditTotal - r.debitTotal, r.code]),
                ['本期淨利（保留盈餘）', netProfit, '3310']
              ], 
              subtotal: totalEquity 
            }
          ],
          total: totalLiabilitiesAndEquity
        }
      ]
    };
  } catch (err) {
    console.warn('資產負債表讀取 Supabase 失敗，降級使用本地計算:', err.message);
    // 降級邏輯也保持會計平衡
    const { trialBalance } = runAccountingPipeline(transactions);
    
    const revenueRows = trialBalance.rows.filter(r => r.code.startsWith('4'));
    const expenseRows = trialBalance.rows.filter(r => r.code.startsWith('5') || r.code.startsWith('6'));
    const totalRevenue = revenueRows.reduce((sum, r) => sum + (r.creditTotal - r.debitTotal), 0);
    const totalExpense = expenseRows.reduce((sum, r) => sum + (r.debitTotal - r.creditTotal), 0);
    const netProfit = totalRevenue - totalExpense;

    const cashRow = trialBalance.rows.find(r => r.code === '1102');
    const cash = cashRow ? cashRow.debitTotal - cashRow.creditTotal : 0;
    
    const capitalRow = trialBalance.rows.find(r => r.code === '3110');
    const capital = capitalRow ? capitalRow.creditTotal - capitalRow.debitTotal : 0;

    return {
      type: 'structured',
      sections: [
        {
          title: '資產 (Assets)',
          subsections: [
            { title: '流動資產', items: [['現金及銀行存款', Math.max(0, cash), '1102']], subtotal: Math.max(0, cash) },
            { title: '非流動資產', items: [], subtotal: 0 }
          ],
          total: Math.max(0, cash)
        },
        {
          title: '負債及權益 (Liabilities & Equity)',
          subsections: [
            { title: '流動負債', items: [], subtotal: 0 },
            { title: '權益', items: [['股本', capital, '3110'], ['本期淨利', netProfit, '3310']], subtotal: capital + netProfit }
          ],
          total: capital + netProfit
        }
      ]
    };
  }
}

export async function buildCashflowStatement(transactions, startDate = null, endDate = null) {
  try {
    const companyId = getActiveCompanyId();
    let accountQuery = supabase.from('accounts').select('id').eq('code', '1102');
    if (companyId) accountQuery = accountQuery.eq('company_id', companyId);
    const { data: bankAccount, error: bankErr } = await accountQuery.single();
    if (bankErr || !bankAccount) throw new Error('找不到銀行存款科目');

    let query = supabase
      .from('journal_entries')
      .select('debit_account_id, credit_account_id, debit_amount, credit_amount, voucher_id, vouchers(category)')
      .not('voucher_id', 'is', null);
    if (companyId) query = query.eq('company_id', companyId);
    if (startDate) query = query.gte('entry_date', startDate);
    if (endDate) query = query.lte('entry_date', endDate);
    const { data: entries, error } = await query;
    if (error) throw error;

    const totals = { 營業: 0, 投資: 0, 融資: 0 };
    entries.forEach(entry => {
      const category = entry.vouchers?.category || '營業';
      if (!(category in totals)) totals[category] = 0;
      if (entry.debit_account_id === bankAccount.id) totals[category] += Number(entry.debit_amount || 0);
      if (entry.credit_account_id === bankAccount.id) totals[category] -= Number(entry.credit_amount || 0);
    });

    const net = totals['營業'] + totals['投資'] + totals['融資'];
    return [
      ['營業活動現金流量', totals['營業']],
      ['投資活動現金流量', totals['投資']],
      ['融資活動現金流量', totals['融資']],
      ['淨現金增加額', net]
    ];
  } catch (err) {
    console.warn('現金流量表讀取 Supabase 失敗，降級使用本地計算:', err.message);
    const { operating, investing, financing, net } = buildCashFlowByActivity(transactions);
    return [
      ['營業活動現金流量', operating],
      ['投資活動現金流量', investing],
      ['融資活動現金流量', financing],
      ['淨現金增加額', net]
    ];
  }
}

export async function buildEquityStatement(transactions, startDate = null, endDate = null) {
  try {
    const { rows } = await fetchSupabaseTrialBalance(startDate, endDate);
    
    // 💡 修正：改為動態抓取所有收入 (4開頭) 與費用 (5、6開頭) 科目，與損益表保持一致
    const totalRevenue = rows.filter(r => r.code.startsWith('4')).reduce((sum, r) => sum + (r.creditTotal - r.debitTotal), 0);
    const totalExpense = rows.filter(r => r.code.startsWith('5') || r.code.startsWith('6')).reduce((sum, r) => sum + (r.debitTotal - r.creditTotal), 0);
    const retainedEarnings = totalRevenue - totalExpense;

    // 抓取股本變動 (這裡假設所有 31 開頭的都是股本相關，或者保留原來的 3110)
    const capitalRow = rows.find(r => r.code === '3110');
    const capitalChange = capitalRow ? capitalRow.creditTotal - capitalRow.debitTotal : 0;

    let openingCapital = 0;
    try {
      const companyId = getActiveCompanyId();
      if (companyId) {
        const comp = await getCompanyInfo(companyId);
        openingCapital = Number(comp.totalCapital || comp.total_capital || 0);
      }
    } catch (e) {
      console.warn('Unable to fetch company info for opening capital', e);
    }

    const endingEquity = openingCapital + capitalChange + retainedEarnings;

    return [
      ['期初股本', openingCapital],
      ['本期新增股本（募資/借款）', capitalChange],
      ['本期損益（保留盈餘）', retainedEarnings],
      ['期末權益合計', endingEquity]
    ];
  } catch (err) {
    console.warn('權益變動表讀取 Supabase 失敗，降級使用本地計算:', err.message);
    const { openingCapital, capitalChange, retainedEarnings, endingEquity } = buildEquityAnalysis(transactions);
    return [
      ['期初股本', openingCapital],
      ['本期新增股本（募資/借款）', capitalChange],
      ['本期損益（保留盈餘）', retainedEarnings],
      ['期末權益合計', endingEquity]
    ];
  }
}

/**
 * 💡 新增：檢查銀行餘額是否足夠支付專案預算
 * @param {number} projectCost - 即將發生的專案預算或支出
 * @returns {object} { isSufficient: boolean, currentCash: number, shortage: number, message: string }
 */
export async function checkBudgetSufficiency(projectCost = 0) {
  try {
    // 取得當前總資產(試算表)，只抓銀行存款 '1102'
    const { rows } = await fetchSupabaseTrialBalance();
    const bankRow = rows.find(r => r.code === '1102');
    const currentCash = bankRow ? bankRow.debitTotal - bankRow.creditTotal : 0;

    const isSufficient = currentCash >= projectCost;
    const shortage = isSufficient ? 0 : projectCost - currentCash;

    return {
      isSufficient,
      currentCash,
      projectCost,
      shortage,
      message: isSufficient 
        ? `資金充足 (目前銀行餘額: $${currentCash.toLocaleString()})，足以支付本次專案。`
        : `⚠️ 資金預警：銀行餘額不足以支付專案！尚缺 $${shortage.toLocaleString()}，請考慮排程募資或跟催應收帳款。`
    };
  } catch (error) {
    console.error('預算檢查失敗:', error);
    return { 
      isSufficient: false, 
      error: true, 
      message: '無法取得目前銀行餘額以進行評估' 
    };
  }
}

export function getEquityAnalysis(transactions) {
  return buildEquityAnalysis(transactions);
}

export function getTrialBalance(transactions) {
  return runAccountingPipeline(transactions).trialBalance;
}