import { supabase } from '../../../scripts/supabaseClient.js';

// 上傳附件至 Supabase Storage 並寫入 voucher_attachments 資料表
export async function saveAttachment(voucherId, file) {
  if (!file) return null;

  // 1. 產生不重複的檔名與路徑
  const fileExt = file.name.split('.').pop();
  const filePath = `vouchers/${voucherId}/${Date.now()}.${fileExt}`;

  // 2. 上傳實體檔案至 Supabase Storage Bucket
  const { data: storageData, error: uploadError } = await supabase
    .storage
    .from('voucher-attachments')
    .upload(filePath, file);

  if (uploadError) throw new Error('圖片上傳至 Storage 失敗：' + uploadError.message);

  // 3. 取得公開網址 (Public URL)
  const { data: { publicUrl } } = supabase
    .storage
    .from('voucher-attachments')
    .getPublicUrl(filePath);

  // 4. 將附件網址與單據 ID 綁定，寫入資料庫 public.voucher_attachments
  const { data, error: dbError } = await supabase
    .from('voucher_attachments')
    .insert({
      voucher_id: voucherId,
      file_name: file.name,
      file_type: file.type,
      file_url: publicUrl
    })
    .select()
    .single();

  if (dbError) throw new Error('寫入附件資料表失敗：' + dbError.message);
  return data;
}

// 取得單據的所有附件列表
export async function getAttachmentsByVoucherId(voucherId) {
  const { data, error } = await supabase
    .from('voucher_attachments')
    .select('*')
    .eq('voucher_id', voucherId);

  if (error) throw error;
  return data;
}

// 開啟附件網址
export function openAttachment(fileUrl) {
  if (fileUrl) {
    window.open(fileUrl, '_blank');
  }
}