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
export async function updateProjectBudget(projectId, oldAmount, newAmount, reason, userId) {
  // 1. 更新 projects 資料表的新預算
  const { error: updateError } = await supabase
    .from('projects')
    .update({ 
      total_budget: newAmount,
      // 剩餘預算的重新計算應在後端或這裡一併處理（此處先簡化為由總額直接覆蓋，實際需扣除已花費）
    })
    .eq('id', projectId)
    ;
    
  if (updateError) throw updateError;

  // 2. 寫入 project_budget_logs 紀錄表
  const { error: logError } = await supabase
    .from('project_budget_logs')
    .insert([{
      project_id: projectId,
      changed_by: userId,
      old_amount: oldAmount,
      new_amount: newAmount,
      change_reason: reason
    }]);

  if (logError) throw logError;
  return true;
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