import { runAccountingPipeline, buildEquityAnalysis, buildCashFlowByActivity } from '../src/modules/accounting/index.js';
import { supabase } from './supabaseClient.js';
import { getCompanyInfo } from './companyContext.js';

const SUPABASE_PAGE_SIZE = 1000;

function applyJournalEntryDateFilters(query, startDate, endDate) {
  let nextQuery = query;
  if (startDate) nextQuery = nextQuery.gte('entry_date', startDate);
  if (endDate) nextQuery = nextQuery.lte('entry_date', endDate);
  return nextQuery;
}

async function fetchAllSupabaseRows(buildQuery, {
  label = 'supabase rows',
  pageSize = SUPABASE_PAGE_SIZE,
  buildCountQuery = null
} = {}) {
  const rows = [];
  let expectedCount = null;

  if (buildCountQuery) {
    const { count, error } = await buildCountQuery();
    if (error) {
      console.warn(`Unable to count ${label}:`, error.message);
    } else {
      expectedCount = count || 0;
    }
  }

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery().range(from, to);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
    if (from > 100000) throw new Error(`${label} pagination exceeded safety limit`);
  }

  if (expectedCount !== null && rows.length < expectedCount) {
    console.warn(`${label} fetched ${rows.length} rows but count is ${expectedCount}.`);
  }

  return rows;
}

function buildJournalEntriesQuery(selectColumns, startDate, endDate, selectOptions = {}) {
  return applyJournalEntryDateFilters(
    supabase.from('journal_entries').select(selectColumns, selectOptions),
    startDate,
    endDate
  );
}

function debitBase(entry) {
  return Number(entry?.debit_amount_base ?? entry?.debit_amount ?? 0);
}

function creditBase(entry) {
  return Number(entry?.credit_amount_base ?? entry?.credit_amount ?? 0);
}

function amountBase(row) {
  return Number(row?.amount_base ?? row?.amount ?? 0);
}

function buildJournalViewQuery(startDate, endDate) {
  return buildJournalEntriesQuery(`
      id,
      entry_date,
      memo,
      debit_amount,
      credit_amount,
      debit_amount_base,
      credit_amount_base,
      currency,
      exchange_rate,
      voucher_id,
      debit_account:accounts!journal_entries_debit_account_id_fkey(code, name),
      credit_account:accounts!journal_entries_credit_account_id_fkey(code, name),
      vouchers(voucher_no)
    `, startDate, endDate)
    .order('entry_date', { ascending: false });
}

export function summarizeTransactions(transactions) {
  const revenue = transactions.filter(t => t.type === '?嗅').reduce((sum, t) => sum + amountBase(t), 0);
  const expense = transactions.filter(t => t.type === '?臬').reduce((sum, t) => sum + amountBase(t), 0);
  const netProfit = revenue - expense;
  return { revenue, expense, netProfit };
}

async function fetchSupabaseTrialBalance(startDate, endDate) {
  const entries = await fetchAllSupabaseRows(
    () => buildJournalEntriesQuery('*', startDate, endDate),
    {
      label: 'journal_entries trial balance',
      buildCountQuery: () => buildJournalEntriesQuery('id', startDate, endDate, { count: 'exact', head: true })
    }
  );

  let accQuery = supabase.from('accounts').select('*');  const { data: accounts, error: accError } = await accQuery;
  if (accError) throw accError;

  const ledger = {};
  accounts.forEach(acc => { ledger[acc.id] = { account: acc, debitTotal: 0, creditTotal: 0 }; });

  entries.forEach(entry => {
    if (ledger[entry.debit_account_id]) ledger[entry.debit_account_id].debitTotal += debitBase(entry);
    if (ledger[entry.credit_account_id]) ledger[entry.credit_account_id].creditTotal += creditBase(entry);
  });

  // Registered capital is company metadata. Only paid-in contributions belong
  // in the statements, paired with an opening debit to bank deposits.
  const company = await getCompanyInfo();
  const paidInCapital = Number(company.capitalCash || 0)
    + Number(company.capitalProperty || 0)
    + Number(company.capitalTechnology || 0)
    + Number(company.capitalMergeNew || 0);
  const openingDateIsInScope = !endDate
    || !company.plannedOpenDate
    || company.plannedOpenDate <= endDate;
  const capitalAccount = accounts.find(account => account.code === '3110');
  const cashAccount = accounts.find(account => account.code === '1102');

  if (openingDateIsInScope && paidInCapital > 0 && capitalAccount && cashAccount) {
    const postedCapital = ledger[capitalAccount.id].creditTotal - ledger[capitalAccount.id].debitTotal;
    const openingSupplement = Math.max(0, paidInCapital - postedCapital);
    ledger[capitalAccount.id].creditTotal += openingSupplement;
    ledger[cashAccount.id].debitTotal += openingSupplement;
  }

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

// ? ??fetchSupabaseTrialBalance ?詨?嚗???? code -> account_id 撠銵剁?
// 靘?buildTrialBalance ?蔥?像銵董蝪?IFRS 隤踵?????交撠?蝘雿輻??
async function fetchSupabaseTrialBalanceWithIds(startDate, endDate) {
  const { rows } = await fetchSupabaseTrialBalance(startDate, endDate);
  const { data: accounts, error } = await supabase.from('accounts').select('id, code');
  if (error) throw error;
  const accountIdByCode = {};
  accounts.forEach(a => { accountIdByCode[a.code] = a.id; });
  return { rows, accountIdByCode };
}

export async function buildJournal(transactions = [], startDate = null, endDate = null) {
  try {
    const journalEntries = await fetchAllSupabaseRows(
      () => buildJournalViewQuery(startDate, endDate),
      {
        label: 'journal_entries journal view',
        buildCountQuery: () => buildJournalEntriesQuery('id', startDate, endDate, { count: 'exact', head: true })
      }
    );

    // ? 靽桀儔???箇??嚗??Map 隞?id 雿 key ?脰??駁?
    const uniqueEntries = Array.from(new Map(journalEntries.map(e => [e.id, e])).values());

    return uniqueEntries.map(entry => {
      // ? 靽桀儔???Ⅳ憿舐內嚗?????航” vouchers ??voucher_no嚗???憿舐內 id ??'-'
      const displayVoucher = entry.vouchers?.voucher_no || entry.voucher_id || '-';

      return {
        id: entry.id,
        date: entry.entry_date,
        summary: entry.memo || '?芾酉??,
        bank: '-',
        debitAccount: entry.debit_account ? `${entry.debit_account.code} ${entry.debit_account.name}` : '-',
        debitAmount: debitBase(entry),
        creditAccount: entry.credit_account ? `${entry.credit_account.code} ${entry.credit_account.name}` : '-',
        creditAmount: creditBase(entry),
        voucher: displayVoucher,
        status: '撌脣撣?
      };
    });
  } catch (err) {
    console.warn('?亥?撣唾???Supabase 憭望?嚗?蝝蝙?冽?啗?蝞?', err.message);
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
    
    // 靘?閮誨蝣潮??剛?飛憿?4??箇?璆剜?伐?5/6??箇?璆剛祥??
    const revenueRows = rows.filter(r => r.code.startsWith('4'));
    const expenseRows = rows.filter(r => r.code.startsWith('5') || r.code.startsWith('6'));

    const totalRevenue = revenueRows.reduce((sum, r) => sum + (r.creditTotal - r.debitTotal), 0);
    const totalExpense = expenseRows.reduce((sum, r) => sum + (r.debitTotal - r.creditTotal), 0);
    const netProfit = totalRevenue - totalExpense;

    return {
      type: 'structured',
      sections: [
        {
          title: '銝??璆剜??,
          items: revenueRows.map(r => [r.name, r.creditTotal - r.debitTotal, r.code]),
          subtotal: totalRevenue
        },
        {
          title: '鈭?璆剛祥??,
          items: expenseRows.map(r => [r.name, r.debitTotal - r.creditTotal, r.code]),
          subtotal: totalExpense
        }
      ],
      netProfit
    };
  } catch (err) {
    console.warn('??銵刻???Supabase 憭望?嚗?蝝蝙?冽?啗?蝞?', err.message);
    const { trialBalance } = runAccountingPipeline(transactions);
    const revenueRows = trialBalance.rows.filter(r => r.code.startsWith('4'));
    const expenseRows = trialBalance.rows.filter(r => r.code.startsWith('5') || r.code.startsWith('6'));
    const totalRevenue = revenueRows.reduce((sum, r) => sum + (r.creditTotal - r.debitTotal), 0);
    const totalExpense = expenseRows.reduce((sum, r) => sum + (r.debitTotal - r.creditTotal), 0);
    const netProfit = totalRevenue - totalExpense;

    return {
      type: 'structured',
      sections: [
        { title: '銝??璆剜??, items: revenueRows.map(r => [r.name, r.creditTotal - r.debitTotal, r.code]), subtotal: totalRevenue },
        { title: '鈭?璆剛祥??, items: expenseRows.map(r => [r.name, r.debitTotal - r.creditTotal, r.code]), subtotal: totalExpense }
      ],
      netProfit
    };
  }
}

export async function buildBalanceSheet(transactions, startDate = null, endDate = null) {
  try {    const { rows } = await fetchSupabaseTrialBalance(startDate, endDate);
    
    // 1. ???祕?銵董?園?憿?(??撠董憿舐內?剁?銝??銵典像銵∟?蝞?
    // 瘜冽?嚗ank_accounts.balance ?航??澈??GENERATED 甈?嚗?蝑 opening_balance嚗?
    // ?⊥???隞颱?銝蝑?銵?瘞湛??迨?寧????憿?+ ?銵?瘞湔?胯???蝞?撖阡?憿?
    const { data: banks } = await supabase.from('bank_accounts').select('id, opening_balance');
    const { data: bankTxs } = await supabase.from('bank_transactions').select('bank_account_id, type, amount, amount_base');
    const realBankBalance = (banks || []).reduce((sum, b) => {
      const txs = (bankTxs || []).filter(t => t.bank_account_id === b.id);
      const net = txs.reduce((s, t) => s + (t.type === '?臬' ? -amountBase(t) : amountBase(t)), 0);
      return sum + Number(b.opening_balance || 0) + net;
    }, 0);

    // 2. 靘??Ｚ??菔”隞?Ⅳ閬??脰??惜蝭拚
    const currentAssetsRows = rows.filter(r => r.code.startsWith('1') && !r.code.startsWith('15') && !r.code.startsWith('16'));
    const nonCurrentAssetsRows = rows.filter(r => r.code.startsWith('15') || r.code.startsWith('16'));
    const currentLiabilitiesRows = rows.filter(r => r.code.startsWith('2'));
    const equityRows = rows.filter(r => r.code.startsWith('3'));

    // ? ?渲牲??ERP 蝟餌絞雿?嚗蜇鞈敹??湔雿輻?岫蝞” (??)?????蜇嚗Ⅱ靽硫撟唾﹛
    const currentAssetsTotal = currentAssetsRows.reduce((sum, r) => sum + (r.debitTotal - r.creditTotal), 0);
    const nonCurrentAssetsTotal = nonCurrentAssetsRows.reduce((sum, r) => sum + (r.debitTotal - r.creditTotal), 0);
    const totalAssets = currentAssetsTotal + nonCurrentAssetsTotal;

    const currentLiabilitiesTotal = currentLiabilitiesRows.reduce((sum, r) => sum + (r.creditTotal - r.debitTotal), 0);
    const capitalTotal = equityRows.reduce((sum, r) => sum + (r.creditTotal - r.debitTotal), 0);

    // 閮??祆?瘛典隞乩蔥?乩???擗?(???? 4, 5, 6 ?)
    const totalRevenue = rows.filter(r => r.code.startsWith('4')).reduce((sum, r) => sum + (r.creditTotal - r.debitTotal), 0);
    const totalExpense = rows.filter(r => r.code.startsWith('5') || r.code.startsWith('6')).reduce((sum, r) => sum + (r.debitTotal - r.creditTotal), 0);
    const netProfit = totalRevenue - totalExpense;

    const totalEquity = capitalTotal + netProfit;
    const totalLiabilitiesAndEquity = currentLiabilitiesTotal + totalEquity;

    return {
      type: 'structured',
      sections: [
        {
          title: '鞈 (Assets)',
          subsections: [
            { 
              title: '瘚?鞈', 
              items: currentAssetsRows.map(r => {
                if (r.code === '1102') {
                  // ?恍銝??＊蝷箏董?ａ?憿??祕擗?嚗靘踵?閮?瞍?
                  const ledgerBalance = r.debitTotal - r.creditTotal;
                  const discrepancy = realBankBalance - ledgerBalance;
                  const note = discrepancy !== 0 ? ` (蝬脤?撖阡?: $${realBankBalance.toLocaleString()} / 撌桅?: $${discrepancy.toLocaleString()})` : '';
                  return [`${r.name}${note}`, ledgerBalance, r.code];
                }
                return [r.name, r.debitTotal - r.creditTotal, r.code];
              }), 
              subtotal: currentAssetsTotal 
            },
            { title: '??????, items: nonCurrentAssetsRows.map(r => [r.name, r.debitTotal - r.creditTotal, r.code]), subtotal: nonCurrentAssetsTotal }
          ],
          total: totalAssets
        },
        {
          title: '鞎????(Liabilities & Equity)',
          subsections: [
            { title: '瘚?鞎', items: currentLiabilitiesRows.map(r => [r.name, r.creditTotal - r.debitTotal, r.code]), subtotal: currentLiabilitiesTotal },
            { 
              title: '甈?', 
              items: [
                ...equityRows.map(r => [r.name, r.creditTotal - r.debitTotal, r.code]),
                ['?祆?瘛典嚗???擗?', netProfit, '3310']
              ], 
              subtotal: totalEquity 
            }
          ],
          total: totalLiabilitiesAndEquity
        }
      ]
    };
  } catch (err) {
    console.warn('鞈鞎銵刻???Supabase 憭望?嚗?蝝蝙?冽?啗?蝞?', err.message);
    // ???摩銋???閮像銵?
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
          title: '鞈 (Assets)',
          subsections: [
            { title: '瘚?鞈', items: [['?暸???銵?甈?, Math.max(0, cash), '1102']], subtotal: Math.max(0, cash) },
            { title: '??????, items: [], subtotal: 0 }
          ],
          total: Math.max(0, cash)
        },
        {
          title: '鞎????(Liabilities & Equity)',
          subsections: [
            { title: '瘚?鞎', items: [], subtotal: 0 },
            { title: '甈?', items: [['?⊥', capital, '3110'], ['?祆?瘛典', netProfit, '3310']], subtotal: capital + netProfit }
          ],
          total: capital + netProfit
        }
      ]
    };
  }
}

export async function buildCashflowStatement(transactions, startDate = null, endDate = null) {
  try {    // ? 靽格迤嚗??maybeSingle() ?誨 single()??
    // ??RLS ???蝙?亥岷? 0 蝑?嚗ingle() ????HTTP 406 Not Acceptable嚗?
    // maybeSingle() ????{ data: null }嚗??敹??隤支蒂撟單????箸?啗?蝞?
    let accountQuery = supabase.from('accounts').select('id').eq('code', '1102');    const { data: bankAccount, error: bankErr } = await accountQuery.maybeSingle();
    if (bankErr || !bankAccount) throw new Error('?曆??圈?銵?甈曄???);

    let query = supabase
      .from('journal_entries')
      .select('debit_account_id, credit_account_id, debit_amount, credit_amount, debit_amount_base, credit_amount_base, voucher_id, vouchers(category)')
      .not('voucher_id', 'is', null);    if (startDate) query = query.gte('entry_date', startDate);
    if (endDate) query = query.lte('entry_date', endDate);
    const { data: entries, error } = await query;
    if (error) throw error;

    const totals = { ?平: 0, ??: 0, ??: 0 };
    entries.forEach(entry => {
      const category = entry.vouchers?.category || '?平';
      if (!(category in totals)) totals[category] = 0;
      if (entry.debit_account_id === bankAccount.id) totals[category] += debitBase(entry);
      if (entry.credit_account_id === bankAccount.id) totals[category] -= creditBase(entry);
    });

    const net = totals['?平'] + totals['??'] + totals['??'];
    return [
      ['?平瘣餃??暸?瘚?', totals['?平']],
      ['??瘣餃??暸?瘚?', totals['??']],
      ['??瘣餃??暸?瘚?', totals['??']],
      ['瘛函????', net]
    ];
  } catch (err) {
    console.warn('?暸?瘚?銵刻???Supabase 憭望?嚗?蝝蝙?冽?啗?蝞?', err.message);
    const { operating, investing, financing, net } = buildCashFlowByActivity(transactions);
    return [
      ['?平瘣餃??暸?瘚?', operating],
      ['??瘣餃??暸?瘚?', investing],
      ['??瘣餃??暸?瘚?', financing],
      ['瘛函????', net]
    ];
  }
}

export async function buildEquityStatement(transactions, startDate = null, endDate = null) {
  try {
    const { rows } = await fetchSupabaseTrialBalance(startDate, endDate);
    
    // ? 靽格迤嚗?箏????????(4?) ?祥??(5???) 蝘嚗???銵其?????
    const totalRevenue = rows.filter(r => r.code.startsWith('4')).reduce((sum, r) => sum + (r.creditTotal - r.debitTotal), 0);
    const totalExpense = rows.filter(r => r.code.startsWith('5') || r.code.startsWith('6')).reduce((sum, r) => sum + (r.debitTotal - r.creditTotal), 0);
    const retainedEarnings = totalRevenue - totalExpense;

    // ???⊥霈? (?ㄐ?身???31 ???航?祉??????靘? 3110)
    const capitalRow = rows.find(r => r.code === '3110');
    const capitalChange = capitalRow ? capitalRow.creditTotal - capitalRow.debitTotal : 0;

    let openingCapital = 0;
    try {
      const comp = await getCompanyInfo() || {};
      openingCapital = Number(comp.totalCapital || comp.total_capital || 0);
    } catch (e) {
      console.warn('Unable to fetch company info for opening capital', e);
    }

    const endingEquity = openingCapital + capitalChange + retainedEarnings;

    return [
      ['???⊥', openingCapital],
      ['?祆??啣??⊥嚗?鞈??狡嚗?, capitalChange],
      ['?祆???嚗???擗?', retainedEarnings],
      ['?甈???', endingEquity]
    ];
  } catch (err) {
    console.warn('甈?霈?銵刻???Supabase 憭望?嚗?蝝蝙?冽?啗?蝞?', err.message);
    const { openingCapital, capitalChange, retainedEarnings, endingEquity } = buildEquityAnalysis(transactions);
    return [
      ['???⊥', openingCapital],
      ['?祆??啣??⊥嚗?鞈??狡嚗?, capitalChange],
      ['?祆???嚗???擗?', retainedEarnings],
      ['?甈???', endingEquity]
    ];
  }
}

/**
 * ? ?啣?嚗炎?仿?銵?憿?西雲憭隞?獢?蝞?
 * @param {number} projectCost - ?喳??潛???獢?蝞??臬
 * @returns {object} { isSufficient: boolean, currentCash: number, shortage: number, message: string }
 */
export async function checkBudgetSufficiency(projectCost = 0) {
  try {
    // ???嗅?蝮質???閰衣?銵?嚗??銵?甈?'1102'
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
        ? `鞈??雲 (?桀??銵?憿? $${currentCash.toLocaleString()})嚗雲隞交隞甈∪?獢
        : `?? 鞈??郎嚗?銵?憿?頞喃誑?臭?撠?嚗?蝻?$${shortage.toLocaleString()}嚗?????????祆??嗅董甈整
    };
  } catch (error) {
    console.error('??瑼Ｘ憭望?:', error);
    return { 
      isSufficient: false, 
      error: true, 
      message: '?⊥????桀??銵?憿誑?脰?閰摯' 
    };
  }
}

/**
 * ? ?啣?嚗岫蝞”嚗rial Balance嚗?靘??桀??箏/鞎豢????憿? * includeAdjustments=true ?????像銵董蝪踴葉撌脫?? IFRS 隤踵??銝雿萄?蝮踝?
 * ??ocal GAAP ??蝮賢董 + IFRS 隤踵??撅扎?雿萄??摮? */
export async function buildTrialBalance(transactions = [], startDate = null, endDate = null, includeAdjustments = false) {
  let adjustmentTotals = {};
  if (includeAdjustments) {
    try {
      const { fetchApprovedAdjustmentTotals } = await import('../src/modules/ifrsAdjustments/ifrsAdjustmentsApi.js');
      adjustmentTotals = await fetchApprovedAdjustmentTotals(startDate, endDate);
    } catch (err) {
      console.warn('霈??IFRS 隤踵??憭望?嚗?憿舐內??蝮賢董?詨?:', err.message);
    }
  }

  try {
    const { rows, accountIdByCode } = await fetchSupabaseTrialBalanceWithIds(startDate, endDate);
    const merged = rows.map(r => {
      const adj = adjustmentTotals[accountIdByCode[r.code]];
      const debitTotal = Number(r.debitTotal || 0) + Number(adj?.debitTotal || 0);
      const creditTotal = Number(r.creditTotal || 0) + Number(adj?.creditTotal || 0);
      return { ...r, debitTotal, creditTotal };
    });
    const sorted = [...merged].sort((a, b) => String(a.code).localeCompare(String(b.code)));
    const totalDebit = sorted.reduce((sum, r) => sum + Number(r.debitTotal || 0), 0);
    const totalCredit = sorted.reduce((sum, r) => sum + Number(r.creditTotal || 0), 0);

    return {
      type: 'structured',
      sections: [
        {
          title: includeAdjustments ? '??蝘擗??敦嚗歇??IFRS 隤踵??嚗? : '??蝘擗??敦',
          items: sorted.map(r => [
            `${r.name}嚗?${Number(r.debitTotal || 0).toLocaleString()} / 鞎?${Number(r.creditTotal || 0).toLocaleString()}嚗,
            Number(r.debitTotal || 0) - Number(r.creditTotal || 0),
            r.code
          ]),
          subtotal: totalDebit
        }
      ],
      netProfit: undefined,
      trialBalanceCheck: { totalDebit, totalCredit, balanced: totalDebit === totalCredit }
    };
  } catch (err) {
    console.warn('閰衣?銵刻???Supabase 憭望?嚗?蝝蝙?冽?啗?蝞?', err.message);
    const { trialBalance } = runAccountingPipeline(transactions);
    const sorted = [...trialBalance.rows].sort((a, b) => String(a.code).localeCompare(String(b.code)));
    const totalDebit = sorted.reduce((sum, r) => sum + Number(r.debitTotal || 0), 0);
    const totalCredit = sorted.reduce((sum, r) => sum + Number(r.creditTotal || 0), 0);
    return {
      type: 'structured',
      sections: [
        {
          title: '??蝘擗??敦',
          items: sorted.map(r => [
            `${r.name}嚗?${Number(r.debitTotal || 0).toLocaleString()} / 鞎?${Number(r.creditTotal || 0).toLocaleString()}嚗,
            Number(r.debitTotal || 0) - Number(r.creditTotal || 0),
            r.code
          ]),
          subtotal: totalDebit
        }
      ],
      trialBalanceCheck: { totalDebit, totalCredit, balanced: totalDebit === totalCredit }
    };
  }
}

/**
 * ? ?啣?嚗?鞈移蝞翰????????望?????蝻箏璅⊥?具???蝷摮? * 嚗?研???擗?望??蜇憿?偌雿????嗉???鞎餌嚗? */
export async function buildFundraisingSnapshot(transactions = [], startDate = null, endDate = null) {
  try {
    const { rows } = await fetchSupabaseTrialBalance(startDate, endDate);
    const paidInCapital = rows.filter(r => r.code.startsWith('31')).reduce((s, r) => s + (r.creditTotal - r.debitTotal), 0);
    const totalRevenue = rows.filter(r => r.code.startsWith('4')).reduce((s, r) => s + (r.creditTotal - r.debitTotal), 0);
    const totalExpense = rows.filter(r => r.code.startsWith('5') || r.code.startsWith('6')).reduce((s, r) => s + (r.debitTotal - r.creditTotal), 0);
    const retainedEarnings = totalRevenue - totalExpense;
    const totalEquity = paidInCapital + retainedEarnings;
    const cashRow = rows.find(r => r.code === '1102');
    const cashBalance = cashRow ? cashRow.debitTotal - cashRow.creditTotal : 0;

    // 靘?鈭斗?蝝?項???遢?賂?隡啁????嚗祥??    const months = new Set((transactions || []).map(t => (t.date || '').slice(0, 7))).size || 1;
    const monthlyRevenue = totalRevenue / months;
    const monthlyExpense = totalExpense / months;

    return { paidInCapital, retainedEarnings, totalEquity, cashBalance, monthlyRevenue, monthlyExpense, months };
  } catch (err) {
    console.warn('??蝎曄?鞈?霈?仃????雿輻?砍閮?:', err.message);
    const analysis = buildEquityAnalysis(transactions);
    const months = new Set((transactions || []).map(t => (t.date || '').slice(0, 7))).size || 1;
    const monthlyExpense = analysis.cashRunwayMonths ? analysis.cashBalance / analysis.cashRunwayMonths : 0;
    return {
      paidInCapital: analysis.openingCapital + analysis.capitalChange,
      retainedEarnings: analysis.retainedEarnings,
      totalEquity: analysis.endingEquity,
      cashBalance: analysis.cashBalance,
      monthlyRevenue: 0,
      monthlyExpense,
      months
    };
  }
}

/**
 * 靘??桐誨蝣澆?敺??憿?debitTotal - creditTotal嚗?靘瓷?梢?閮餌??閬? * 撣嗅?祕?詨?雿??閬??渲岫蝞”?澆???臭蝙?具? */
export async function fetchAccountBalancesByCode(codes = [], startDate = null, endDate = null) {
  try {
    const { rows } = await fetchSupabaseTrialBalanceWithIds(startDate, endDate);
    const map = {};
    rows.forEach(r => { map[r.code] = Number(r.debitTotal || 0) - Number(r.creditTotal || 0); });
    const result = {};
    codes.forEach(c => { result[c] = map[c] || 0; });
    return result;
  } catch (err) {
    console.warn('霈???桅?憿仃??', err.message);
    const zero = {};
    codes.forEach(c => { zero[c] = 0; });
    return zero;
  }
}

export function getEquityAnalysis(transactions) {
  return buildEquityAnalysis(transactions);
}

export function getTrialBalance(transactions) {
  return runAccountingPipeline(transactions).trialBalance;
}

export async function buildBalanceSheetLedgerOnly(transactions, startDate = null, endDate = null) {
  try {
    const { rows } = await fetchSupabaseTrialBalance(startDate, endDate);
    const currentAssetsRows = rows.filter(r => r.code.startsWith('1') && !r.code.startsWith('15') && !r.code.startsWith('16'));
    const nonCurrentAssetsRows = rows.filter(r => r.code.startsWith('15') || r.code.startsWith('16'));
    const currentLiabilitiesRows = rows.filter(r => r.code.startsWith('2'));
    const equityRows = rows.filter(r => r.code.startsWith('3'));

    const currentAssetsTotal = currentAssetsRows.reduce((sum, r) => sum + (r.debitTotal - r.creditTotal), 0);
    const nonCurrentAssetsTotal = nonCurrentAssetsRows.reduce((sum, r) => sum + (r.debitTotal - r.creditTotal), 0);
    const totalAssets = currentAssetsTotal + nonCurrentAssetsTotal;
    const currentLiabilitiesTotal = currentLiabilitiesRows.reduce((sum, r) => sum + (r.creditTotal - r.debitTotal), 0);
    const capitalTotal = equityRows.reduce((sum, r) => sum + (r.creditTotal - r.debitTotal), 0);
    const totalRevenue = rows.filter(r => r.code.startsWith('4')).reduce((sum, r) => sum + (r.creditTotal - r.debitTotal), 0);
    const totalExpense = rows.filter(r => r.code.startsWith('5') || r.code.startsWith('6')).reduce((sum, r) => sum + (r.debitTotal - r.creditTotal), 0);
    const netProfit = totalRevenue - totalExpense;
    const totalEquity = capitalTotal + netProfit;
    const totalLiabilitiesAndEquity = currentLiabilitiesTotal + totalEquity;

    return {
      type: 'structured',
      sections: [
        {
          title: '鞈 (Assets)',
          subsections: [
            { title: '瘚?鞈', items: currentAssetsRows.map(r => [r.name, r.debitTotal - r.creditTotal, r.code]), subtotal: currentAssetsTotal },
            { title: '??????, items: nonCurrentAssetsRows.map(r => [r.name, r.debitTotal - r.creditTotal, r.code]), subtotal: nonCurrentAssetsTotal }
          ],
          total: totalAssets
        },
        {
          title: '鞎????(Liabilities & Equity)',
          subsections: [
            { title: '瘚?鞎', items: currentLiabilitiesRows.map(r => [r.name, r.creditTotal - r.debitTotal, r.code]), subtotal: currentLiabilitiesTotal },
            {
              title: '甈?',
              items: [
                ...equityRows.map(r => [r.name, r.creditTotal - r.debitTotal, r.code]),
                ['?祆???', netProfit, '3310']
              ],
              subtotal: totalEquity
            }
          ],
          total: totalLiabilitiesAndEquity
        }
      ]
    };
  } catch (err) {
    console.warn('Ledger-only balance sheet failed; falling back to local calculation:', err.message);
    return buildBalanceSheet(transactions, startDate, endDate);
  }
}

export async function getBankReconciliationStatus(startDate = null, endDate = null) {
  const { rows } = await fetchSupabaseTrialBalance(startDate, endDate);
  const accountsResult = await supabase.from('accounts').select('id, code, name');
  if (accountsResult.error) throw accountsResult.error;

  const accountById = new Map((accountsResult.data || []).map(a => [a.id, a]));
  const ledgerByAccountId = new Map();
  rows.forEach(row => {
    const accountId = [...accountById.values()].find(a => a.code === row.code)?.id;
    if (accountId) ledgerByAccountId.set(accountId, Number(row.debitTotal || 0) - Number(row.creditTotal || 0));
  });

  let bankQuery = supabase
    .from('bank_accounts')
    .select('id, bank_name, account_number, nickname, opening_balance, ledger_account_id, accounting_account_id');
  const bankResult = await bankQuery;
  if (bankResult.error) throw bankResult.error;

  let txQuery = supabase
    .from('bank_transactions')
    .select('bank_account_id, tx_date, type, amount, amount_base, balance_after_base');
  if (startDate) txQuery = txQuery.gte('tx_date', startDate);
  if (endDate) txQuery = txQuery.lte('tx_date', endDate);
  const txResult = await txQuery;
  if (txResult.error) throw txResult.error;

  const txsByBankId = new Map();
  (txResult.data || []).forEach(tx => {
    if (!txsByBankId.has(tx.bank_account_id)) txsByBankId.set(tx.bank_account_id, []);
    txsByBankId.get(tx.bank_account_id).push(tx);
  });

  const accounts = bankResult.data || [];
  const rowsOut = accounts.map(bank => {
    const linkedAccountId = bank.ledger_account_id || bank.accounting_account_id || null;
    const actualBalance = Number(bank.opening_balance || 0) + (txsByBankId.get(bank.id) || []).reduce((sum, tx) => {
      const amount = amountBase(tx);
      return tx.type === '?臬' ? sum - amount : sum + amount;
    }, 0);
    const ledgerBalance = linkedAccountId ? Number(ledgerByAccountId.get(linkedAccountId) || 0) : null;
    const difference = ledgerBalance == null ? null : actualBalance - ledgerBalance;
    return {
      bankAccountId: bank.id,
      label: bank.nickname || `${bank.bank_name || '?芸??銵?} ${bank.account_number || ''}`.trim(),
      linkedAccountId,
      linkedAccountCode: linkedAccountId ? accountById.get(linkedAccountId)?.code || null : null,
      actualBalance,
      ledgerBalance,
      difference,
      status: !linkedAccountId ? 'unbound' : difference === 0 ? 'matched' : 'difference'
    };
  });

  const actualTotal = rowsOut.reduce((sum, row) => sum + Number(row.actualBalance || 0), 0);
  const ledgerTotal = rowsOut.reduce((sum, row) => sum + Number(row.ledgerBalance || 0), 0);
  const unboundCount = rowsOut.filter(row => row.status === 'unbound').length;
  const difference = actualTotal - ledgerTotal;

  return {
    rows: rowsOut,
    actualTotal,
    ledgerTotal,
    difference,
    status: unboundCount > 0 ? 'unbound' : difference === 0 ? 'matched' : 'difference'
  };
}

export async function buildCashflowStatementByLinkedBanks(transactions, startDate = null, endDate = null) {
  try {
    const bankResult = await supabase
      .from('bank_accounts')
      .select('ledger_account_id, accounting_account_id');
    if (bankResult.error) throw bankResult.error;

    const linkedBankAccountIds = [...new Set((bankResult.data || [])
      .map(bank => bank.ledger_account_id || bank.accounting_account_id)
      .filter(Boolean))];

    if (linkedBankAccountIds.length === 0) {
      return [
        ['?平瘣餃??暸?瘚?', 0],
        ['??瘣餃??暸?瘚?', 0],
        ['蝐?瘣餃??暸?瘚?', 0],
        ['?銵董?嗅??芰?摰蜇撣喟??殷??暸?瘚?銵冽銝誑?銵祕??憿蝞?, 0]
      ];
    }

    let query = supabase
      .from('journal_entries')
      .select('debit_account_id, credit_account_id, debit_amount, credit_amount, debit_amount_base, credit_amount_base, voucher_id, vouchers(category)')
      .not('voucher_id', 'is', null);
    if (startDate) query = query.gte('entry_date', startDate);
    if (endDate) query = query.lte('entry_date', endDate);
    const { data: entries, error } = await query;
    if (error) throw error;

    const totals = { '?平': 0, '??': 0, '??': 0 };
    (entries || []).forEach(entry => {
      const category = entry.vouchers?.category || '?平';
      if (!(category in totals)) totals[category] = 0;
      if (linkedBankAccountIds.includes(entry.debit_account_id)) totals[category] += debitBase(entry);
      if (linkedBankAccountIds.includes(entry.credit_account_id)) totals[category] -= creditBase(entry);
    });

    const net = totals['?平'] + totals['??'] + totals['??'];
    return [
      ['?平瘣餃??暸?瘚?', totals['?平']],
      ['??瘣餃??暸?瘚?', totals['??']],
      ['蝐?瘣餃??暸?瘚?', totals['??']],
      ['?祆??暸????嗥????皜?嚗?, net]
    ];
  } catch (err) {
    console.warn('Linked-bank cashflow failed; falling back to legacy calculation:', err.message);
    return buildCashflowStatement(transactions, startDate, endDate);
  }
}
