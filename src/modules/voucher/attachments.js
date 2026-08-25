import { supabase } from '../../../scripts/supabaseClient.js';

const STORAGE_BUCKET = 'voucher-attachments';

/**
 * 將 File 物件上傳至 Supabase Storage，回傳 { filePath, publicUrl }。
 * 注意：此函式「只」負責上傳實體檔案與產生路徑，不寫入 DB。
 * 寫入 voucher_attachments 資料表請用 saveAttachment()。
 */
export async function uploadAttachmentFile(file) {
  if (!file) return null;

  // 1. 產生不重複的檔名與路徑（使用時間戳避免碰撞）
  const fileExt = (file.name.split('.').pop() || 'bin').toLowerCase();
  const safeName = (file.name || 'file').replace(/[^\w.\-\u4e00-\u9fff]/g, '_');
  const filePath = `vouchers/${Date.now()}-${Math.random().toString(36).slice(2, 8)}/${safeName}`;

  // 2. 上傳實體檔案至 Supabase Storage Bucket
  const { error: uploadError } = await supabase
    .storage
    .from(STORAGE_BUCKET)
    .upload(filePath, file);

  if (uploadError) throw new Error('附件上傳至 Storage 失敗：' + uploadError.message);

  // 3. 取得公開網址 (Public URL)
  const { data: { publicUrl } } = supabase
    .storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(filePath);

  return { filePath, publicUrl, fileExt };
}

// 上傳附件至 Supabase Storage 並寫入 voucher_attachments 資料表
export async function saveAttachment(voucherId, file) {
  if (!file) return null;
  if (!voucherId) throw new Error('缺少 voucherId，無法綁定附件到憑證。');

  const uploaded = await uploadAttachmentFile(file);
  if (!uploaded) return null;

  // 4. 將附件網址與單據 ID 綁定，寫入資料庫 public.voucher_attachments
  const { data, error: dbError } = await supabase
    .from('voucher_attachments')
    .insert({
      voucher_id: voucherId,
      file_name: file.name,
      file_type: file.type,
      file_url: uploaded.publicUrl,
      file_path: uploaded.filePath,
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
    .eq('voucher_id', voucherId)
    ;

  if (error) throw error;
  return data;
}

// 開啟附件網址
export function openAttachment(fileUrl) {
  if (fileUrl) {
    window.open(fileUrl, '_blank');
  }
}

/**
 * 刪除指定附件（同時刪除 Storage 實體檔案與資料庫紀錄）。
 * @param {string} attachmentId - voucher_attachments 的 id
 * @param {string|null} filePath - 儲存於 Storage 的路徑（可由 file_url 推估，或直接傳入）
 */
export async function deleteAttachment(attachmentId, filePath = null) {
  if (!attachmentId) throw new Error('缺少 attachmentId，無法刪除附件。');

  // 1. 若未提供 filePath，先查詢資料庫取得該筆紀錄
  let pathToDelete = filePath;
  let dbRecord = null;
  if (!pathToDelete) {
    const { data, error: fetchError } = await supabase
      .from('voucher_attachments')
      .select('*')
      .eq('id', attachmentId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    dbRecord = data;
    if (!dbRecord) return { success: false, message: '附件紀錄不存在（可能已刪除）。' };
    pathToDelete = dbRecord.file_path || extractStoragePath(dbRecord.file_url);
  }

  // 2. 從 Storage 刪除實體檔案（若可解析出路徑）
  if (pathToDelete) {
    const { error: storageError } = await supabase
      .storage
      .from(STORAGE_BUCKET)
      .remove([pathToDelete]);
    if (storageError) console.warn('刪除 Storage 檔案失敗（已忽略，繼續刪除 DB 紀錄）:', storageError.message);
  }

  // 3. 刪除資料庫紀錄
  const { error: dbError } = await supabase
    .from('voucher_attachments')
    .delete()
    .eq('id', attachmentId);
  if (dbError) throw dbError;

  return { success: true, message: '附件已刪除。' };
}

/**
 * 從 file_url 反推 Storage 路徑（例如
 * https://xxx.supabase.co/storage/v1/object/public/voucher-attachments/vouchers/xxx/xxx.png
 * → vouchers/xxx/xxx.png）
 */
function extractStoragePath(fileUrl) {
  if (!fileUrl) return null;
  try {
    const marker = `/object/public/${STORAGE_BUCKET}/`;
    const idx = fileUrl.indexOf(marker);
    if (idx === -1) return null;
    return fileUrl.slice(idx + marker.length);
  } catch (e) {
    return null;
  }
}
