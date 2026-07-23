async function bootstrap() {
  try {
    await import('./ui.js');
  } catch (error) {
    console.error('系統初始化失敗：', error);
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;padding:12px 16px;font-family:sans-serif;font-size:14px;z-index:9999;line-height:1.5;';
    banner.textContent = `⚠️ 系統載入失敗，請截圖這則訊息回報：${error.message}`;
    document.body.prepend(banner);
  }
}

bootstrap();

// ==========================================
// 報支單明細：新增一列 (包含日期、發票號碼連動與身分證遮蔽)
// ==========================================
window.addExcelRow = () => {
  const tbody = document.getElementById('excelLinesBody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td style="padding:4px; border:1px solid #ddd;">
      <input type="month" class="grid-date" style="width:96%; padding:4px;" required>
    </td>
    <td style="padding:4px; border:1px solid #ddd;">
      <select class="grid-inv-type" style="width:100%; padding:4px;" onchange="toggleInvoiceNum(this)">
        <option value="無">無</option>
        <option value="發票" selected>發票</option>
        <option value="收據">收據</option>
      </select>
    </td>
    <td style="padding:4px; border:1px solid #ddd;">
      <input type="text" class="grid-inv-num" placeholder="請填寫發票號碼" style="width:90%; padding:4px;" required>
    </td>
    <td style="padding:4px; border:1px solid #ddd;">
      <input type="text" class="grid-desc" placeholder="項目/摘要說明 (例: 住宿費)" style="width:96%; padding:4px;" required>
    </td>
    <td style="padding:4px; border:1px solid #ddd;">
      <input type="number" class="grid-amount" placeholder="金額" style="width:90%; padding:4px;" min="0" oninput="calculateTotalAmount()" required>
    </td>
    <td style="padding:4px; border:1px solid #ddd; white-space: nowrap;">
      <input type="text" class="grid-payee-id" placeholder="填身分證/統編" style="width:50%; padding:4px;" onblur="fetchAndMaskPayee(this)">
      <span class="payee-name-display" style="margin-left:5px; color:#0369a1; font-weight:bold; font-size:13px;"></span>
    </td>
    <td style="padding:4px; border:1px solid #ddd; text-align:center;">
      <button type="button" class="danger" onclick="this.closest('tr').remove(); calculateTotalAmount();">刪除</button>
    </td>
  `;
  tbody.appendChild(tr);
};

// ==========================================
// 憑證類別連動檢查（選擇發票時強制填寫發票號碼）
// ==========================================
window.toggleInvoiceNum = (selectEl) => {
  const row = selectEl.closest('tr');
  const invNumInput = row.querySelector('.grid-inv-num');
  if (selectEl.value === '發票') {
    invNumInput.setAttribute('required', 'true');
    invNumInput.placeholder = '必填發票號碼';
  } else {
    invNumInput.removeAttribute('required');
    invNumInput.placeholder = '選填';
  }
};

// ==========================================
// 計算整張表單的總金額
// ==========================================
window.calculateTotalAmount = () => {
  const amounts = document.querySelectorAll('.grid-amount');
  let total = 0;
  amounts.forEach(input => {
    total += parseFloat(input.value) || 0;
  });
  
  // 自動將加總結果顯示在下方的總計區塊 (若 HTML 有對應 ID)
  const totalDisplay = document.getElementById('voucherTotalAmount');
  if (totalDisplay) {
    totalDisplay.textContent = '$' + total.toLocaleString();
  }
};

// ==========================================
// 身分證/統編 查詢與姓名遮蔽 (例如：李O白)
// ==========================================
window.fetchAndMaskPayee = async (inputEl) => {
  const idStr = inputEl.value.trim();
  const displaySpan = inputEl.closest('td').querySelector('.payee-name-display');
  
  if (!idStr) {
    displaySpan.textContent = '';
    return;
  }

  displaySpan.textContent = '查詢中...';
  try {
    // 💡 之後這裡會換成正式的 Supabase 資料庫查詢 API
    // 例如：const { data } = await supabase.from('vendors').select('name').eq('tax_id', idStr).single();
    
    // 這裡先用模擬資料庫來測試前端效果
    const fullName = await mockFetchNameFromDB(idStr);

    if (fullName) {
      displaySpan.textContent = maskName(fullName);
    } else {
      displaySpan.textContent = '查無此人';
    }
  } catch (err) {
    displaySpan.textContent = '查詢失敗';
  }
};

// 姓名遮蔽邏輯
function maskName(name) {
  if (!name) return '';
  if (name.length <= 2) return name[0] + 'O';
  if (name.length === 3) return name[0] + 'O' + name[2];
  return name[0] + 'O'.repeat(name.length - 2) + name[name.length - 1];
}

// 模擬資料庫查詢 (測試用)
async function mockFetchNameFromDB(idStr) {
  return new Promise((resolve) => {
    setTimeout(() => {
      // 若輸入這兩組身分證，會讀取到特定人名，否則預設帶出李大白
      if (idStr === 'B223755666') resolve('李曉明'); 
      else if (idStr === 'R932012338') resolve('張曉嵐');
      else resolve('李大白');
    }, 400); 
  });
}

function loadState() {
  const saved = localStorage.getItem('my_app_state');
  let state = saved ? JSON.parse(saved) : { transactions: [] };

  // --- 新增：自動過濾掉舊的 14 筆預設資料（假設它們有固定的 ID 範圍，例如 tx-1 ~ tx-14 或特定的預設特徵） ---
  if (state.transactions && state.transactions.length > 0) {
    // 假設這 14 筆舊資料的 ID 是用 'tx-1' 到 'tx-14'，或者您可以根據它們共同的特徵（例如某個特定的日期或明細名稱）來過濾
    const defaultIds = ['tx-1', 'tx-2', 'tx-3', 'tx-4', 'tx-5', 'tx-6', 'tx-7', 'tx-8', 'tx-9', 'tx-10', 'tx-11', 'tx-12', 'tx-13', 'tx-14'];
    
    // 只保留「不是」這 14 筆預設 ID 的新資料
    state.transactions = state.transactions.filter(tx => !defaultIds.includes(tx.id));
    
    // 處理完後存回 localStorage，確保以後不會重複觸發
    localStorage.setItem('my_app_state', JSON.stringify(state));
  }

  return state;
}