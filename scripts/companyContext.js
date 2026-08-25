import { supabase } from './supabaseClient.js';

let companyInfoCache = null;

function mapCompanySettings(row = {}) {
  return {
    companyNameZh: row.company_name_zh || '',
    companyNameEn: row.company_name_en || '',
    taxId: row.tax_id || '',
    phone: row.phone || '',
    address: row.address || '',
    precheckNumber: row.precheck_number || '',
    representativeName: row.representative_name || '',
    boardCount: Number(row.board_count || 0),
    totalCapital: Number(row.total_capital || 0),
    capitalCash: Number(row.capital_cash || 0),
    capitalProperty: Number(row.capital_property || 0),
    capitalTechnology: Number(row.capital_technology || 0),
    capitalMergeNew: Number(row.capital_merge_new || 0),
    plannedOpenDate: row.planned_open_date || '',
    articlesDate: row.articles_date || ''
  };
}

export async function getCompanyInfo() {
  if (companyInfoCache) return { ...companyInfoCache };
  const { data, error } = await supabase
    .from('company_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  companyInfoCache = mapCompanySettings(data || {});
  return { ...companyInfoCache };
}

export async function getCompanyDataBundle() {
  const [companyInfo, businessResult, shareholderResult] = await Promise.all([
    getCompanyInfo(),
    supabase.from('company_business_items').select('*').order('sort_order'),
    supabase.from('company_shareholders').select('*').order('sort_order')
  ]);

  if (businessResult.error) throw businessResult.error;
  if (shareholderResult.error && shareholderResult.error.code !== 'PGRST116') {
    console.warn('Shareholder data is restricted for this account.');
  }

  return {
    companyInfo,
    businessItems: (businessResult.data || []).map(row => ({ code: row.code, item: row.item, sortOrder: row.sort_order })),
    directorShareholders: (shareholderResult.data || []).map(row => ({
      id: row.id,
      role: row.role_title,
      name: row.full_name,
      idNumber: row.national_id,
      amount: Number(row.contribution_amount || 0),
      address: row.address,
      sortOrder: row.sort_order
    }))
  };
}

export async function saveCompanyInfo(companyInfo) {
  const { data: authData } = await supabase.auth.getUser();
  const payload = {
    id: 1,
    company_name_zh: companyInfo.companyNameZh || '',
    company_name_en: companyInfo.companyNameEn || null,
    tax_id: companyInfo.taxId || null,
    phone: companyInfo.phone || null,
    address: companyInfo.address || null,
    precheck_number: companyInfo.precheckNumber || null,
    representative_name: companyInfo.representativeName || null,
    board_count: Number(companyInfo.boardCount || 0),
    total_capital: Number(companyInfo.totalCapital || 0),
    capital_cash: Number(companyInfo.capitalCash || 0),
    capital_property: Number(companyInfo.capitalProperty || 0),
    capital_technology: Number(companyInfo.capitalTechnology || 0),
    capital_merge_new: Number(companyInfo.capitalMergeNew || 0),
    planned_open_date: companyInfo.plannedOpenDate || null,
    articles_date: companyInfo.articlesDate || null,
    updated_by: authData?.user?.id || null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('company_settings')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  companyInfoCache = mapCompanySettings(data);
  return { ...companyInfoCache };
}

export async function saveCompanyBusinessItems(items = []) {
  const cleanItems = items
    .map((item, index) => ({
      code: String(item.code || '').trim().toUpperCase(),
      item: String(item.item || '').trim(),
      sort_order: index + 1,
      updated_at: new Date().toISOString()
    }))
    .filter(item => item.code || item.item);

  cleanItems.forEach(item => {
    if (!item.code || !item.item) throw new Error('營業項目需同時填寫代碼與項目名稱');
  });

  const seenCodes = new Set();
  for (const item of cleanItems) {
    if (seenCodes.has(item.code)) throw new Error(`營業項目代碼重複：${item.code}`);
    seenCodes.add(item.code);
  }

  const { error: deleteError } = await supabase
    .from('company_business_items')
    .delete()
    .neq('code', '');
  if (deleteError) throw deleteError;

  if (cleanItems.length) {
    const { error: insertError } = await supabase
      .from('company_business_items')
      .insert(cleanItems);
    if (insertError) throw insertError;
  }

  return cleanItems.map(item => ({ code: item.code, item: item.item, sortOrder: item.sort_order }));
}

export async function saveCompanyShareholders(shareholders = []) {
  const cleanShareholders = shareholders
    .map((person, index) => ({
      role_title: String(person.role || '').trim() || null,
      full_name: String(person.name || '').trim(),
      national_id: String(person.idNumber || '').trim() || null,
      contribution_amount: Number(person.amount || 0),
      address: String(person.address || '').trim() || null,
      sort_order: index + 1,
      updated_at: new Date().toISOString()
    }))
    .filter(person => person.full_name || person.role_title || person.national_id || person.contribution_amount || person.address);

  cleanShareholders.forEach(person => {
    if (!person.full_name) throw new Error('董監名單需填寫姓名');
    if (person.contribution_amount < 0 || Number.isNaN(person.contribution_amount)) {
      throw new Error(`董監出資金額不正確：${person.full_name}`);
    }
  });

  const { error: deleteError } = await supabase
    .from('company_shareholders')
    .delete()
    .not('id', 'is', null);
  if (deleteError) throw deleteError;

  if (cleanShareholders.length) {
    const { error: insertError } = await supabase
      .from('company_shareholders')
      .insert(cleanShareholders);
    if (insertError) throw insertError;
  }

  const totalContribution = cleanShareholders.reduce((sum, person) => sum + Number(person.contribution_amount || 0), 0);
  const { data: authData } = await supabase.auth.getUser();
  const { data: companyRow, error: companyError } = await supabase
    .from('company_settings')
    .upsert({
      id: 1,
      capital_cash: totalContribution,
      updated_by: authData?.user?.id || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' })
    .select()
    .single();
  if (companyError) throw companyError;
  companyInfoCache = mapCompanySettings(companyRow);

  return {
    shareholders: cleanShareholders.map(person => ({
      role: person.role_title,
      name: person.full_name,
      idNumber: person.national_id,
      amount: Number(person.contribution_amount || 0),
      address: person.address,
      sortOrder: person.sort_order
    })),
    companyInfo: { ...companyInfoCache }
  };
}

export async function getMyCompanies() {
  return [];
}

export async function getCurrentMembership() {
  return null;
}

export async function validateCompanyAccess() {
  return true;
}

export async function getActiveCompany() {
  return { id: null, name: '當前公司' };
}

const ROLE_PERMISSIONS = {
  super_admin: ['user.invite', 'report.view', 'report.export'],
  admin: ['report.view', 'report.export'],
  accounting: ['report.view', 'report.export'],
  manager: ['report.view'],
  employee: []
};

export function getCurrentPermissions(role) {
  return ROLE_PERMISSIONS[role] || [];
}

export async function getStructureSettings() {
  return [];
}

export function getActiveCompanyId() {
  return null;
}

export function setActiveCompanyId() {
  return null;
}

export function clearCompanyCache() {
  return null;
}
