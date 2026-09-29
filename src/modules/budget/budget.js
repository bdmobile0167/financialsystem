import { supabase } from '../../../scripts/supabaseClient.js';

// 建立專案
export async function createProject(projectData) {
  const code = `PROJ-${new Date().getFullYear()}${(new Date().getMonth()+1).toString().padStart(2,'0')}-${Math.floor(Math.random()*999).toString().padStart(3,'0')}`;
  
  const { data, error } = await supabase
    .from('projects')
    .insert([{ ...projectData, project_code: code, remaining_budget: projectData.total_budget }])
    .select().single();
  if (error) throw error;
  return data;
}

// 新增：變更預算並寫入紀錄
export async function updateProjectBudget(projectId, oldAmount, newAmount, reason, userId, settings = {}) {
  // The database derives the actor and remaining budget inside one transaction.
  const { data, error } = await supabase.rpc('update_project_budget_atomic', {
    p_project_id: projectId,
    p_expected_budget: oldAmount,
    p_new_budget: newAmount,
    p_reason: reason || '',
    p_settings: settings
  });
  if (error) throw error;
  return data;
}

// 新增：取得專案的預算變更歷史
export async function fetchProjectBudgetLogs(projectId) {
  const { data, error } = await supabase
    .from('project_budget_logs')
    .select('*, profiles!changed_by(full_name)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
    
  if (error) throw error;
  return data;
}
