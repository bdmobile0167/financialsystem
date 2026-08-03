// src/modules/project/project.js
import { supabase } from '../../scripts/supabaseClient.js';
import { getActiveCompanyId } from '../../scripts/companyContext.js';

export async function fetchProjects() {
  const companyId = getActiveCompanyId();
  let q = supabase.from('projects').select('*');
  if (companyId) q = q.eq('company_id', companyId);
  const { data } = await q;
  return data;
}

export async function createProject({ projectCode, name, totalBudget }) {
  const { data, error } = await supabase
    .from('projects')
    .insert([{ project_code: projectCode, name, total_budget: totalBudget, remaining_budget: totalBudget, company_id: getActiveCompanyId() }])
    .select().single();
  if (error) throw error;
  return data;
}