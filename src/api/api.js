// api.js
export async function fetchCompanyData() {
    const response = await fetch('/api/company');
    return await response.json();
}

// src/api/api.js
export async function getCompanyData() {
  const response = await fetch('/api/company-info'); // 你的後端 API 網址
  if (!response.ok) throw new Error('取得資料失敗');
  return await response.json();
}