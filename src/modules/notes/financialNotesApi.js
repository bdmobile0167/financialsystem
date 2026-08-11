import { supabase } from '../../../scripts/supabaseClient.js';

export async function fetchFinancialReportNotes() {
  const { data, error } = await supabase
    .from('financial_report_notes')
    .select('*')
    .order('note_key');
  if (error) throw error;
  return data;
}

export async function updateFinancialReportNote(noteKey, content) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;

  const { error } = await supabase
    .from('financial_report_notes')
    .update({ content, updated_by: userId })
    .eq('note_key', noteKey);
  if (error) throw error;
}
