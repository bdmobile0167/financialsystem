import { supabase } from './supabaseClient.js';
import { getCapitalComparison, parseCapitalAmount } from '../src/modules/company/capital.js';
import { listAccessibleCompanies, readCompanyMembership, canAccessCompany } from '../src/modules/company/companyAccess.js';

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
    capitalEffectiveDate: row.capital_effective_date || row.planned_open_date || '',
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
  const normalizedCapital = {
    totalCapital: parseCapitalAmount(companyInfo.totalCapital, '資本總額'),
    capitalCash: parseCapitalAmount(companyInfo.capitalCash, '現金出資'),
    capitalProperty: parseCapitalAmount(companyInfo.capitalProperty, '財產出資'),
    capitalTechnology: parseCapitalAmount(companyInfo.capitalTechnology, '技術出資'),
    capitalMergeNew: parseCapitalAmount(companyInfo.capitalMergeNew, '合併新設出資')
  };
  const capitalComparison = getCapitalComparison(normalizedCapital);
  if (capitalComparison.paidInExceedsTotal) {
    throw new Error('實收資本額不可高於資本總額');
  }
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
    total_capital: normalizedCapital.totalCapital,
    capital_cash: normalizedCapital.capitalCash,
    capital_property: normalizedCapital.capitalProperty,
    capital_technology: normalizedCapital.capitalTechnology,
    capital_merge_new: normalizedCapital.capitalMergeNew,
    capital_effective_date: companyInfo.capitalEffectiveDate || companyInfo.plannedOpenDate || null,
    planned_open_date: companyInfo.plannedOpenDate || null,
    articles_date: companyInfo.articlesDate || null,
    updated_by: authData?.user?.id || null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('company_settings')
    .upsert(payload, { onConflict: 'company_id,id' })
    .select()
    .single();
  if (error) throw error;
  companyInfoCache = mapCompanySettings(data);
  return { ...companyInfoCache };
}

export async function saveCompanyShareholders(shareholders = []) {
  const cleanShareholders = shareholders
    .map((person, index) => ({
      role_title: String(person.role || '').trim() || null,
      full_name: String(person.name || '').trim(),
      national_id: String(person.idNumber || '').trim() || null,
      contribution_amount: Number(person.amount || 0),
      address: String(person.address || '').trim() || null,
      sort_order: index + 1
    }))
    .filter(person => person.full_name || person.role_title || person.national_id || person.contribution_amount || person.address);

  cleanShareholders.forEach(person => {
    if (!person.full_name) throw new Error('董監名單需填寫姓名');
    if (person.contribution_amount < 0 || !Number.isFinite(person.contribution_amount)) {
      throw new Error(`董監出資金額不正確：${person.full_name}`);
    }
  });

  const { data, error } = await supabase.rpc('save_company_shareholders', {
    p_shareholders: cleanShareholders
  });
  if (error) throw error;
  const savedRows = Array.isArray(data?.shareholders) ? data.shareholders : [];

  return {
    shareholders: savedRows.map(person => ({
      id: person.id,
      role: person.role_title,
      name: person.full_name,
      idNumber: person.national_id,
      amount: Number(person.contribution_amount || 0),
      address: person.address,
      sortOrder: person.sort_order
    })),
    contributionTotal: Number(data?.contribution_total || 0)
  };
}

export async function getMyCompanies() {
  return listAccessibleCompanies(supabase);
}

export async function getCurrentMembership(companyId = getActiveCompanyId()) {
  return readCompanyMembership(supabase, companyId);
}

export async function validateCompanyAccess(companyId = getActiveCompanyId()) {
  return canAccessCompany(supabase, companyId);
}

export async function getActiveCompany() {
  const companyId = getActiveCompanyId();
  if (!companyId) return null;
  const companies = await getMyCompanies();
  return companies.find(company => company.company_id === companyId) || null;
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
  throw new Error('公司帳務隔離尚未完成，暫不開放公司切換。');
}

export function clearCompanyCache() {
  companyInfoCache = null;
}
