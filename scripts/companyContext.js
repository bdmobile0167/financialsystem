import { supabase } from './supabaseClient.js';

export async function getCompanyInfo(companyId) {
  if (!companyId) return {};
  try {
    const { data, error } = await supabase.from('companies').select('*').eq('id', companyId).single();
    if (error) {
      console.error('getCompanyInfo error', error);
      return {};
    }
    return data || {};
  } catch (err) {
    console.error('getCompanyInfo exception', err);
    return {};
  }
}

export async function getMyCompanies(userId) {
  if (!userId) return [];
  try {
    const { data, error } = await supabase
      .from('company_memberships')
      .select('company_id, role, status, companies(id, name, company_name_zh, company_name_en, company_code)')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error) {
      console.error('getMyCompanies error', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('getMyCompanies exception', err);
    return [];
  }
}

export async function getCurrentMembership(companyId, userId) {
  if (!companyId || !userId) return null;
  try {
    const { data, error } = await supabase
      .from('company_memberships')
      .select('*')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('getCurrentMembership error', error);
      return null;
    }
    return data || null;
  } catch (err) {
    console.error('getCurrentMembership exception', err);
    return null;
  }
}

export async function validateCompanyAccess(companyId, userId) {
  const membership = await getCurrentMembership(companyId, userId);
  return membership && membership.status === 'active';
}

export async function getActiveCompany() {
  const companyId = getActiveCompanyId();
  if (!companyId) return null;
  return getCompanyInfo(companyId);
}

const ROLE_PERMISSIONS = {
  super_admin: ['company.view', 'company.switch', 'user.invite', 'report.view', 'report.export'],
  admin: ['company.view', 'report.view', 'report.export'],
  accounting: ['report.view', 'report.export'],
  manager: ['report.view'],
  employee: []
};

export function getCurrentPermissions(role) {
  return ROLE_PERMISSIONS[role] || [];
}

export async function getStructureSettings(companyId) {
  if (!companyId) return [];
  try {
    // Try company_settings table first (key/value pairs)
    const { data: kv, error: kvErr } = await supabase.from('company_settings').select('key, value').eq('company_id', companyId);
    if (!kvErr && kv && kv.length) {
      const obj = {};
      kv.forEach(r => { obj[r.key] = r.value; });
      return obj;
    }

    const { data: comp, error: compErr } = await supabase.from('companies').select('structure_settings').eq('id', companyId).single();
    if (!compErr && comp?.structure_settings) return comp.structure_settings;
    return [];
  } catch (err) {
    console.error('getStructureSettings exception', err);
    return [];
  }
}

export function getActiveCompanyId() {
  return localStorage.getItem('current_company_id') || null;
}

export function setActiveCompanyId(id) {
  if (id) localStorage.setItem('current_company_id', id);
  else localStorage.removeItem('current_company_id');
  try {
    window.dispatchEvent(new CustomEvent('companyChanged', { detail: { companyId: id } }));
  } catch (e) { /* ignore */ }
}

export function clearCompanyCache() {
  try {
    localStorage.removeItem('company_cache');
    window.dispatchEvent(new CustomEvent('companyCleared'));
  } catch (e) { console.warn('clearCompanyCache failed', e); }
}
