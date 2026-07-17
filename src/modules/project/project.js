// src/modules/project/project.js
import { supabase } from '../../scripts/supabaseClient.js';

async function fetchProjects() {
  const userRole = state.currentUser?.role;
  let query = supabase.from('projects').select('*').order('project_code');

  if (userRole === 'employee' || userRole === 'manager') {
    query = query.eq('department_id', state.currentUser.department_id);
  }

  const { data } = await query;
  return data || [];
}

export async function createProject({ projectCode, name, totalBudget }) {
  const { data, error } = await supabase
    .from('projects')
    .insert([{ project_code: projectCode, name, total_budget: totalBudget, remaining_budget: totalBudget }])
    .select().single();
  if (error) throw error;
  return data;
}