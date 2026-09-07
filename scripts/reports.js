import { runAccountingPipeline, buildEquityAnalysis, buildCashFlowByActivity } from '../src/modules/accounting/index.js';
import { supabase } from './supabaseClient.js';
import { getCompanyInfo } from './companyContext.js';

const SUPABASE_PAGE_SIZE = 1000;
const OPERATING = 'operating';
const INVESTING = 'investing';
const FINANCING = 'financing';

const LABELS = {
  income: '\u6536\u5165',
  expense: '\u652f\u51fa',
  operating: '\u71df\u696d',
  investing: '\u6295\u8cc7',
  financing: '\u878d\u8cc7',
  operatingRevenue: '\u4e00\u3001\u71df\u696d\u6536\u5165',
  operatingExpense: '\u4e8c\u3001\u71df\u696d\u8cbb\u7528',
  assets: '\u8cc7\u7522 (Assets)',
  currentAssets: '\u6d41\u52d5\u8cc7\u7522',
  nonCurrentAssets: '\u975e\u6d41\u52d5\u8cc7\u7522',
  liabilitiesEquity: '\u8ca0\u50b5\u53ca\u6b0a\u76ca (Liabilities & Equity)',
  currentLiabilities: '\u6d41\u52d5\u8ca0\u50b5',
  equity: '\u6b0a\u76ca',
  netIncome: '\u672c\u671f\u640d\u76ca',
  operatingCashflow: '\u71df\u696d\u6d3b\u52d5\u73fe\u91d1\u6d41\u91cf',
  investingCashflow: '\u6295\u8cc7\u6d3b\u52d5\u73fe\u91d1\u6d41\u91cf',
  financingCashflow: '\u878d\u8cc7\u6d3b\u52d5\u73fe\u91d1\u6d41\u91cf',
  netCashChange: '\u672c\u671f\u73fe\u91d1\u53ca\u7d04\u7576\u73fe\u91d1\u6de8\u589e\u52a0',
  openingCapital: '\u671f\u521d\u80a1\u672c',
  openingRetainedEarnings: '\u671f\u521d\u4fdd\u7559\u76c8\u9918',
  capitalChange: '\u672c\u671f\u80a1\u672c\u8b8a\u52d5',
  endingCapital: '\u671f\u672b\u80a1\u672c',
  endingRetainedEarnings: '\u671f\u672b\u4fdd\u7559\u76c8\u9918',
  endingEquity: '\u671f\u672b\u6b0a\u76ca\u5408\u8a08',
  trialBalance: '\u8a66\u7b97\u8868',
  noMemo: '\u7121\u6458\u8981'
};

function debitBase(entry) {
  return Number(entry?.debit_amount_base ?? entry?.debit_amount ?? 0);
}

function creditBase(entry) {
  return Number(entry?.credit_amount_base ?? entry?.credit_amount ?? 0);
}

function amountBase(row) {
  return Number(row?.amount_base ?? row?.amount ?? 0);
}

function normalizeType(type) {
  if (type === LABELS.income || type === 'income' || type === 'deposit') return 'income';
  if (type === LABELS.expense || type === 'expense' || type === 'withdrawal') return 'expense';
  return type || '';
}

function cashflowActivity(category) {
  if (category === LABELS.investing || category === INVESTING) return INVESTING;
  if (category === LABELS.financing || category === FINANCING) return FINANCING;
  return OPERATING;
}

function accountBalance(row) {
  if (!row) return 0;
  if (row.type === 'asset' || row.type === 'expense') return Number(row.debitTotal || 0) - Number(row.creditTotal || 0);
  return Number(row.creditTotal || 0) - Number(row.debitTotal || 0);
}

function dayBefore(dateString) {
  if (!dateString) return null;
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

function netCreditBalance(rows, code) {
  const row = rows.find(item => item.code === code);
  return row ? Number(row.creditTotal || 0) - Number(row.debitTotal || 0) : 0;
}

function netIncomeFromRows(rows) {
  const revenue = rows
    .filter(row => String(row.code || '').startsWith('4'))
    .reduce((sum, row) => sum + (Number(row.creditTotal || 0) - Number(row.debitTotal || 0)), 0);
  const expense = rows
    .filter(row => String(row.code || '').startsWith('5') || String(row.code || '').startsWith('6'))
    .reduce((sum, row) => sum + (Number(row.debitTotal || 0) - Number(row.creditTotal || 0)), 0);
  return revenue - expense;
}

function applyJournalEntryDateFilters(query, startDate, endDate) {
  let nextQuery = query;
  if (startDate) nextQuery = nextQuery.gte('entry_date', startDate);
  if (endDate) nextQuery = nextQuery.lte('entry_date', endDate);
  return nextQuery;
}

function applyBankTransactionDateFilters(query, startDate, endDate) {
  let nextQuery = query;
  if (startDate) nextQuery = nextQuery.gte('tx_date', startDate);
  if (endDate) nextQuery = nextQuery.lte('tx_date', endDate);
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

function buildBankTransactionsQuery(selectColumns, startDate, endDate, selectOptions = {}) {
  return applyBankTransactionDateFilters(
    supabase.from('bank_transactions').select(selectColumns, selectOptions),
    startDate,
    endDate
  );
}

function localTrialBalance(transactions = []) {
  return runAccountingPipeline(transactions).trialBalance;
}

export function summarizeTransactions(transactions = []) {
  const revenue = transactions
    .filter(tx => normalizeType(tx.type) === 'income')
    .reduce((sum, tx) => sum + amountBase(tx), 0);
  const expense = transactions
    .filter(tx => normalizeType(tx.type) === 'expense')
    .reduce((sum, tx) => sum + amountBase(tx), 0);
  return { revenue, expense, netProfit: revenue - expense };
}

async function fetchSupabaseTrialBalance(startDate = null, endDate = null) {
  const entries = await fetchAllSupabaseRows(
    () => buildJournalEntriesQuery('*', startDate, endDate),
    {
      label: 'journal_entries trial balance',
      buildCountQuery: () => buildJournalEntriesQuery('id', startDate, endDate, { count: 'exact', head: true })
    }
  );

  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select('*')
    .order('code', { ascending: true });
  if (accountsError) throw accountsError;

  const ledger = {};
  (accounts || []).forEach(account => {
    ledger[account.id] = { account, debitTotal: 0, creditTotal: 0 };
  });

  entries.forEach(entry => {
    if (ledger[entry.debit_account_id]) ledger[entry.debit_account_id].debitTotal += debitBase(entry);
    if (ledger[entry.credit_account_id]) ledger[entry.credit_account_id].creditTotal += creditBase(entry);
  });

  try {
    const company = await getCompanyInfo();
    const paidInCapital = Number(company.capitalCash || 0)
      + Number(company.capitalProperty || 0)
      + Number(company.capitalTechnology || 0)
      + Number(company.capitalMergeNew || 0);
    const openingDateIsInScope = !endDate || !company.plannedOpenDate || company.plannedOpenDate <= endDate;
    const capitalAccount = (accounts || []).find(account => account.code === '3110');
    const cashAccount = (accounts || []).find(account => account.code === '1102');

    if (openingDateIsInScope && paidInCapital > 0 && capitalAccount && cashAccount) {
      const postedCapital = ledger[capitalAccount.id].creditTotal - ledger[capitalAccount.id].debitTotal;
      const openingSupplement = Math.max(0, paidInCapital - postedCapital);
      ledger[capitalAccount.id].creditTotal += openingSupplement;
      ledger[cashAccount.id].debitTotal += openingSupplement;
    }
  } catch (error) {
    console.warn('Unable to apply company paid-in capital supplement:', error.message);
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

  const totalDebit = rows.reduce((sum, row) => sum + Number(row.debitTotal || 0), 0);
  const totalCredit = rows.reduce((sum, row) => sum + Number(row.creditTotal || 0), 0);
  return { rows, totalDebit, totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.01 };
}

async function fetchTrialBalance(transactions = [], startDate = null, endDate = null) {
  try {
    return await fetchSupabaseTrialBalance(startDate, endDate);
  } catch (error) {
    console.warn('Unable to load Supabase trial balance, using local transactions:', error.message);
    return localTrialBalance(transactions);
  }
}

export async function buildJournal(transactions = [], startDate = null, endDate = null) {
  try {
    const journalEntries = await fetchAllSupabaseRows(
      () => buildJournalEntriesQuery(`
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
        transaction_id,
        debit_account:accounts!journal_entries_debit_account_id_fkey(code, name),
        credit_account:accounts!journal_entries_credit_account_id_fkey(code, name),
        vouchers(voucher_no)
      `, startDate, endDate).order('entry_date', { ascending: false }),
      {
        label: 'journal_entries journal view',
        buildCountQuery: () => buildJournalEntriesQuery('id', startDate, endDate, { count: 'exact', head: true })
      }
    );

    return Array.from(new Map(journalEntries.map(entry => [entry.id, entry])).values()).map(entry => ({
      id: entry.id,
      date: entry.entry_date,
      summary: entry.memo || LABELS.noMemo,
      bank: '-',
      debitAccount: entry.debit_account ? `${entry.debit_account.code} ${entry.debit_account.name}` : '-',
      debitAmount: debitBase(entry),
      creditAccount: entry.credit_account ? `${entry.credit_account.code} ${entry.credit_account.name}` : '-',
      creditAmount: creditBase(entry),
      voucher: entry.vouchers?.voucher_no || entry.voucher_id || entry.transaction_id || '-',
      status: 'posted'
    }));
  } catch (error) {
    console.warn('Unable to load Supabase journal, using local transactions:', error.message);
    const { journalEntries } = runAccountingPipeline(transactions);
    return journalEntries.map(entry => ({
      date: entry.date,
      summary: entry.memo,
      bank: entry.bank,
      debitAccount: `${entry.debitAccountCode} ${entry.debitAccountName}`,
      debitAmount: entry.debitAmount,
      creditAccount: `${entry.creditAccountCode} ${entry.creditAccountName}`,
      creditAmount: entry.creditAmount,
      voucher: entry.voucher,
      status: entry.status
    }));
  }
}

export async function buildIncomeStatement(transactions = [], startDate = null, endDate = null) {
  const { rows } = await fetchTrialBalance(transactions, startDate, endDate);
  const revenueRows = rows.filter(row => String(row.code || '').startsWith('4'));
  const expenseRows = rows.filter(row => String(row.code || '').startsWith('5') || String(row.code || '').startsWith('6'));
  const totalRevenue = revenueRows.reduce((sum, row) => sum + (Number(row.creditTotal || 0) - Number(row.debitTotal || 0)), 0);
  const totalExpense = expenseRows.reduce((sum, row) => sum + (Number(row.debitTotal || 0) - Number(row.creditTotal || 0)), 0);

  return {
    type: 'structured',
    sections: [
      {
        title: LABELS.operatingRevenue,
        items: revenueRows.map(row => [row.name, Number(row.creditTotal || 0) - Number(row.debitTotal || 0), row.code]),
        subtotal: totalRevenue
      },
      {
        title: LABELS.operatingExpense,
        items: expenseRows.map(row => [row.name, Number(row.debitTotal || 0) - Number(row.creditTotal || 0), row.code]),
        subtotal: totalExpense
      }
    ],
    netProfit: totalRevenue - totalExpense
  };
}

export async function getBankReconciliationStatus(startDate = null, endDate = null) {
  const { data: banks, error: banksError } = await supabase
    .from('bank_accounts')
    .select('id, bank_name, nickname, account_number, opening_balance, balance, current_balance, currency')
    .order('created_at', { ascending: true });
  if (banksError) throw banksError;

  const bankTxs = await fetchAllSupabaseRows(
    () => buildBankTransactionsQuery('id, bank_account_id, tx_date, type, amount, amount_base, balance_after, balance_after_base', startDate, endDate),
    {
      label: 'bank_transactions reconciliation',
      buildCountQuery: () => buildBankTransactionsQuery('id', startDate, endDate, { count: 'exact', head: true })
    }
  );

  const balanceRows = (banks || []).map(bank => {
    const txs = bankTxs.filter(tx => tx.bank_account_id === bank.id);
    const calculatedBalance = txs.reduce((sum, tx) => {
      return normalizeType(tx.type) === 'expense' ? sum - amountBase(tx) : sum + amountBase(tx);
    }, Number(bank.opening_balance || 0));

    return {
      ...bank,
      calculated_balance: calculatedBalance,
      display_balance: bank.current_balance ?? bank.balance ?? calculatedBalance
    };
  });

  const actualBalance = balanceRows.reduce((sum, row) => sum + Number(row.display_balance || 0), 0);
  let ledgerBalance = null;
  try {
    const { rows } = await fetchSupabaseTrialBalance(startDate, endDate);
    const bankRow = rows.find(row => row.code === '1102');
    ledgerBalance = bankRow ? Number(bankRow.debitTotal || 0) - Number(bankRow.creditTotal || 0) : 0;
  } catch (error) {
    console.warn('Unable to calculate ledger bank balance:', error.message);
  }

  const difference = ledgerBalance === null ? null : actualBalance - ledgerBalance;
  return {
    actualBalance,
    ledgerBalance,
    difference,
    balanceRows,
    status: ledgerBalance === null ? 'unknown' : Math.abs(difference) < 0.01 ? 'matched' : 'difference'
  };
}

export async function buildBalanceSheet(transactions = [], startDate = null, endDate = null) {
  const { rows } = await fetchTrialBalance(transactions, startDate, endDate);
  const currentAssetsRows = rows.filter(row => String(row.code || '').startsWith('1') && !String(row.code || '').startsWith('16'));
  const nonCurrentAssetsRows = rows.filter(row => String(row.code || '').startsWith('16'));
  const currentLiabilitiesRows = rows.filter(row => String(row.code || '').startsWith('2'));
  const equityRows = rows.filter(row => String(row.code || '').startsWith('3'));
  const income = await buildIncomeStatement(transactions, startDate, endDate);
  const netProfit = Number(income.netProfit || 0);
  const currentAssetsTotal = currentAssetsRows.reduce((sum, row) => sum + accountBalance(row), 0);
  const nonCurrentAssetsTotal = nonCurrentAssetsRows.reduce((sum, row) => sum + accountBalance(row), 0);
  const liabilitiesTotal = currentLiabilitiesRows.reduce((sum, row) => sum + accountBalance(row), 0);
  const equityAccountTotal = equityRows.reduce((sum, row) => sum + accountBalance(row), 0);

  let reconciliation = null;
  try {
    reconciliation = await getBankReconciliationStatus(startDate, endDate);
  } catch (error) {
    reconciliation = { balanceError: error };
  }

  return {
    type: 'structured',
    sections: [
      {
        title: LABELS.assets,
        subsections: [
          { title: LABELS.currentAssets, items: currentAssetsRows.map(row => [row.name, accountBalance(row), row.code]), subtotal: currentAssetsTotal },
          { title: LABELS.nonCurrentAssets, items: nonCurrentAssetsRows.map(row => [row.name, accountBalance(row), row.code]), subtotal: nonCurrentAssetsTotal }
        ],
        total: currentAssetsTotal + nonCurrentAssetsTotal
      },
      {
        title: LABELS.liabilitiesEquity,
        subsections: [
          { title: LABELS.currentLiabilities, items: currentLiabilitiesRows.map(row => [row.name, accountBalance(row), row.code]), subtotal: liabilitiesTotal },
          {
            title: LABELS.equity,
            items: [
              ...equityRows.map(row => [row.name, accountBalance(row), row.code]),
              [LABELS.netIncome, netProfit, '3310']
            ],
            subtotal: equityAccountTotal + netProfit
          }
        ],
        total: liabilitiesTotal + equityAccountTotal + netProfit
      }
    ],
    reconciliation
  };
}

export async function buildCashflowStatement(transactions = [], startDate = null, endDate = null) {
  try {
    return await buildCashflowStatementByLinkedBanks(transactions, startDate, endDate);
  } catch (error) {
    console.warn('Unable to build linked-bank cashflow, using local transactions:', error.message);
    const analysis = buildCashFlowByActivity(transactions || []);
    return [
      [LABELS.operatingCashflow, analysis.operating],
      [LABELS.investingCashflow, analysis.investing],
      [LABELS.financingCashflow, analysis.financing],
      [LABELS.netCashChange, analysis.net]
    ];
  }
}

export async function buildCashflowStatementByLinkedBanks(transactions = [], startDate = null, endDate = null) {
  const entries = await fetchAllSupabaseRows(
    () => buildJournalEntriesQuery(`
      id,
      debit_amount,
      credit_amount,
      debit_amount_base,
      credit_amount_base,
      vouchers(category)
    `, startDate, endDate),
    {
      label: 'journal_entries cashflow',
      buildCountQuery: () => buildJournalEntriesQuery('id', startDate, endDate, { count: 'exact', head: true })
    }
  );

  const totals = { [OPERATING]: 0, [INVESTING]: 0, [FINANCING]: 0 };
  entries.forEach(entry => {
    const activity = cashflowActivity(entry.vouchers?.category);
    totals[activity] += debitBase(entry) - creditBase(entry);
  });

  const net = totals[OPERATING] + totals[INVESTING] + totals[FINANCING];
  return [
    [LABELS.operatingCashflow, totals[OPERATING]],
    [LABELS.investingCashflow, totals[INVESTING]],
    [LABELS.financingCashflow, totals[FINANCING]],
    [LABELS.netCashChange, net]
  ];
}

export async function buildEquityStatement(transactions = [], startDate = null, endDate = null) {
  try {
    const openingCutoff = dayBefore(startDate);
    const openingTrialBalance = startDate ? await fetchSupabaseTrialBalance(null, openingCutoff) : { rows: [] };
    const openingCapital = netCreditBalance(openingTrialBalance.rows, '3110');
    const openingRetainedEarnings = netCreditBalance(openingTrialBalance.rows, '3310') + netIncomeFromRows(openingTrialBalance.rows);

    const { rows } = await fetchSupabaseTrialBalance(startDate, endDate);
    const capitalChange = netCreditBalance(rows, '3110');
    const retainedAccountChange = netCreditBalance(rows, '3310');
    const netProfitThisPeriod = netIncomeFromRows(rows);
    const retainedEarningsChange = retainedAccountChange + netProfitThisPeriod;
    const endingCapital = openingCapital + capitalChange;
    const endingRetainedEarnings = openingRetainedEarnings + retainedEarningsChange;
    const endingEquity = endingCapital + endingRetainedEarnings;

    return [
      [LABELS.openingCapital, openingCapital],
      [LABELS.openingRetainedEarnings, openingRetainedEarnings],
      [LABELS.capitalChange, capitalChange],
      [LABELS.netIncome, netProfitThisPeriod],
      [LABELS.endingCapital, endingCapital],
      [LABELS.endingRetainedEarnings, endingRetainedEarnings],
      [LABELS.endingEquity, endingEquity]
    ];
  } catch (error) {
    console.warn('Unable to load Supabase equity statement, using local transactions:', error.message);
    const analysis = buildEquityAnalysis(transactions || [], 0);
    const endingCapital = Number(analysis.openingCapital || 0) + Number(analysis.capitalChange || 0);
    return [
      [LABELS.openingCapital, analysis.openingCapital],
      [LABELS.openingRetainedEarnings, 0],
      [LABELS.capitalChange, analysis.capitalChange],
      [LABELS.netIncome, analysis.retainedEarnings],
      [LABELS.endingCapital, endingCapital],
      [LABELS.endingRetainedEarnings, analysis.retainedEarnings],
      [LABELS.endingEquity, analysis.endingEquity]
    ];
  }
}

export async function buildTrialBalance(transactions = [], startDate = null, endDate = null, includeAdjustments = false) {
  const trialBalance = await fetchTrialBalance(transactions, startDate, endDate);
  const rows = [...trialBalance.rows];

  if (includeAdjustments) {
    try {
      const { data: adjustments, error } = await supabase
        .from('ifrs_adjustment_lines')
        .select('debit_amount, credit_amount, accounts(code, name, type)');
      if (error) throw error;

      (adjustments || []).forEach(line => {
        const account = line.accounts;
        if (!account?.code) return;
        let row = rows.find(item => item.code === account.code);
        if (!row) {
          row = { code: account.code, name: account.name, type: account.type, debitTotal: 0, creditTotal: 0 };
          rows.push(row);
        }
        row.debitTotal += Number(line.debit_amount || 0);
        row.creditTotal += Number(line.credit_amount || 0);
      });
    } catch (error) {
      console.warn('Unable to apply IFRS adjustment lines:', error.message);
    }
  }

  rows.sort((a, b) => String(a.code).localeCompare(String(b.code)));
  return {
    type: 'structured',
    sections: [
      {
        title: includeAdjustments ? `${LABELS.trialBalance}\uff08\u542b IFRS \u8abf\u6574\uff09` : LABELS.trialBalance,
        items: rows.map(row => [
          `${row.name}\uff08\u501f ${Number(row.debitTotal || 0).toLocaleString()} / \u8cb8 ${Number(row.creditTotal || 0).toLocaleString()}\uff09`,
          Number(row.debitTotal || 0) - Number(row.creditTotal || 0),
          row.code
        ]),
        subtotal: rows.reduce((sum, row) => sum + Number(row.debitTotal || 0) - Number(row.creditTotal || 0), 0)
      }
    ]
  };
}

export async function buildFundraisingSnapshot(transactions = [], startDate = null, endDate = null) {
  const { rows } = await fetchTrialBalance(transactions, startDate, endDate);
  const cashRow = rows.find(row => row.code === '1102') || rows.find(row => String(row.code || '').startsWith('11'));
  const capitalRow = rows.find(row => row.code === '3110');
  const retainedRow = rows.find(row => row.code === '3310');
  const income = await buildIncomeStatement(transactions, startDate, endDate);

  const cashBalance = cashRow ? Number(cashRow.debitTotal || 0) - Number(cashRow.creditTotal || 0) : 0;
  const paidInCapital = capitalRow ? Number(capitalRow.creditTotal || 0) - Number(capitalRow.debitTotal || 0) : 0;
  const retainedEarnings = (retainedRow ? Number(retainedRow.creditTotal || 0) - Number(retainedRow.debitTotal || 0) : 0)
    + Number(income.netProfit || 0);
  const monthlyRevenue = Number(income.sections?.[0]?.subtotal || 0);
  const monthlyExpense = Number(income.sections?.[1]?.subtotal || 0);

  return {
    paidInCapital,
    retainedEarnings,
    totalEquity: paidInCapital + retainedEarnings,
    cashBalance,
    monthlyRevenue,
    monthlyExpense
  };
}

export async function fetchAccountBalancesByCode(codes = [], startDate = null, endDate = null) {
  const { rows } = await fetchTrialBalance([], startDate, endDate);
  return codes.reduce((acc, code) => {
    const row = rows.find(item => item.code === code);
    acc[code] = accountBalance(row);
    return acc;
  }, {});
}

export function getEquityAnalysis(transactions = []) {
  return buildEquityAnalysis(transactions || [], 0);
}

export function getTrialBalance(transactions = []) {
  return localTrialBalance(transactions);
}

export async function buildBalanceSheetLedgerOnly(transactions = [], startDate = null, endDate = null) {
  return buildBalanceSheet(transactions, startDate, endDate);
}
