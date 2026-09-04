import { supabase } from '../../../scripts/supabaseClient.js';

const STORAGE_BUCKET = 'voucher-attachments';

function makeSafeFileName(name = 'file') {
  return String(name || 'file').replace(/[^\w.\-\u4e00-\u9fff]/g, '_');
}

function extractStoragePath(fileUrl) {
  if (!fileUrl) return null;
  try {
    const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
    const index = fileUrl.indexOf(marker);
    if (index === -1) return null;
    return decodeURIComponent(fileUrl.slice(index + marker.length));
  } catch {
    return null;
  }
}

export async function uploadAttachmentFile(file) {
  if (!file) return null;

  const safeName = makeSafeFileName(file.name);
  const filePath = `vouchers/${Date.now()}-${Math.random().toString(36).slice(2, 8)}/${safeName}`;

  const { error: uploadError } = await supabase
    .storage
    .from(STORAGE_BUCKET)
    .upload(filePath, file);

  if (uploadError) {
    throw new Error(`Attachment upload failed: ${uploadError.message}`);
  }

  const { data } = supabase
    .storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(filePath);

  return {
    filePath,
    publicUrl: data?.publicUrl || '',
    fileExt: (file.name?.split('.').pop() || 'bin').toLowerCase()
  };
}

export async function saveAttachment(voucherIdOrFile, fileMaybe = null) {
  const isStorageOnlyUpload = !fileMaybe && typeof File !== 'undefined' && voucherIdOrFile instanceof File;
  const file = isStorageOnlyUpload ? voucherIdOrFile : fileMaybe;
  const voucherId = isStorageOnlyUpload ? null : voucherIdOrFile;

  if (!file) return null;

  const uploaded = await uploadAttachmentFile(file);
  if (isStorageOnlyUpload) return uploaded.filePath;

  if (!voucherId) {
    throw new Error('Missing voucherId; cannot create voucher attachment record.');
  }

  const { data, error } = await supabase
    .from('voucher_attachments')
    .insert({
      voucher_id: voucherId,
      file_name: file.name,
      file_type: file.type,
      file_url: uploaded.publicUrl,
      file_path: uploaded.filePath
    })
    .select()
    .single();

  if (error) {
    await deleteAttachmentFiles([uploaded.filePath]).catch(() => {});
    throw new Error(`Attachment database record failed: ${error.message}`);
  }

  return data;
}

export async function getAttachmentsByVoucherId(voucherId) {
  if (!voucherId) return [];

  const { data, error } = await supabase
    .from('voucher_attachments')
    .select('*')
    .eq('voucher_id', voucherId);

  if (error) throw error;
  return data || [];
}

export function openAttachment(fileUrl) {
  if (fileUrl) window.open(fileUrl, '_blank');
}

export async function deleteAttachmentFiles(filePaths = []) {
  const paths = [...new Set((filePaths || []).filter(Boolean))];
  if (!paths.length) return { success: true, deletedCount: 0 };

  const { error } = await supabase
    .storage
    .from(STORAGE_BUCKET)
    .remove(paths);

  if (error) throw new Error(`Storage file deletion failed: ${error.message}`);
  return { success: true, deletedCount: paths.length };
}

export async function deleteAttachment(attachmentId, filePath = null) {
  if (!attachmentId) throw new Error('Missing attachmentId; cannot delete attachment.');

  let pathToDelete = filePath;
  if (!pathToDelete) {
    const { data, error } = await supabase
      .from('voucher_attachments')
      .select('file_path,file_url')
      .eq('id', attachmentId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return { success: false, message: 'Attachment record does not exist or was already deleted.' };
    pathToDelete = data.file_path || extractStoragePath(data.file_url);
  }

  if (pathToDelete) {
    await deleteAttachmentFiles([pathToDelete]).catch((error) => {
      console.warn('Storage file deletion failed; deleting DB attachment record anyway.', error.message);
    });
  }

  const { error: dbError } = await supabase
    .from('voucher_attachments')
    .delete()
    .eq('id', attachmentId);

  if (dbError) throw dbError;
  return { success: true, message: 'Attachment deleted.' };
}
