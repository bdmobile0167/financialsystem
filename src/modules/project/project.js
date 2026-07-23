// src/modules/project/project.js
import { supabase } from '../../scripts/supabaseClient.js';

export async function fetchProjects() {
  const { data } = await supabase.from('projects').select('*');
  return data;
}

export async function createProject({ projectCode, name, totalBudget }) {
  const { data, error } = await supabase
    .from('projects')
    .insert([{ project_code: projectCode, name, total_budget: totalBudget, remaining_budget: totalBudget }])
    .select().single();
  if (error) throw error;
  return data;
}