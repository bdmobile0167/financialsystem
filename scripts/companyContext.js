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

export async function getStructureSettings(companyId) {
  if (!companyId) return [];
  try {
    // Try company_settings table first (key/value pairs)
    const { data: kv, error: kvErr } = await supabase.from('company_settings').select('key, value').eq('company_id', companyId);
    if (!kvErr && kv && kv.length) {
      // convert array of {key, value} into object or return raw
      const obj = {};
      kv.forEach(r => { obj[r.key] = r.value; });
      return obj;
    }

    // Fallback: try a JSON column on companies
    const { data: comp, error: compErr } = await supabase.from('companies').select('structure_settings').eq('id', companyId).single();
    if (!compErr && comp?.structure_settings) return comp.structure_settings;
    return [];
  } catch (err) {
    console.error('getStructureSettings exception', err);
    return [];
  }
}
