const STORAGE_KEY = 'voucherAttachments';
const MAX_FILE_SIZE = 1.5 * 1024 * 1024; // 1.5MB，避免 localStorage 塞爆

export function loadAttachments() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
}

export function saveAttachments(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_FILE_SIZE) {
      reject(new Error(`檔案過大（${(file.size / 1024 / 1024).toFixed(1)}MB），請上傳 1.5MB 以內的檔案。`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('讀取檔案失敗。'));
    reader.readAsDataURL(file);
  });
}

export async function saveAttachment(file) {
  const base64 = await fileToBase64(file);
  const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const map = loadAttachments();
  map[id] = { id, fileName: file.name, fileType: file.type, uploadedAt: new Date().toISOString(), data: base64 };
  saveAttachments(map);
  return id;
}

export function getAttachment(id) {
  return loadAttachments()[id] || null;
}

export function openAttachment(id) {
  const attachment = getAttachment(id);
  if (!attachment) return;
  const win = window.open();
  if (attachment.fileType.startsWith('image/')) {
    win.document.write(`<img src="${attachment.data}" style="max-width:100%;" />`);
  } else {
    win.location.href = attachment.data;
  }
}