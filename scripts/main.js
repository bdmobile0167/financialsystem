// ==========================================
// 報支單明細：新增一列 (包含日期、發票號碼連動與身分證遮蔽)
// ==========================================
// 動態產生明細列
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
      <input type="month" class="grid-month" style="width:96%; padding:4px;" required>
    </td>
    <td style="padding:4px; border:1px solid #ddd;">
      <select class="grid-inv-type" style="width:100%; padding:4px;" onchange="toggleInvoiceRequired(this)">
        <option value="無">無</option>
        <option value="發票">發票</option>
        <option value="收據">收據</option>
      </select>
    </td>
    <td style="padding:4px; border:1px solid #ddd;">
      <input type="text" class="grid-inv-num" placeholder="可留空" style="width:90%; padding:4px;" disabled>
    </td>
    <td style="padding:4px; border:1px solid #ddd;">
      <input type="text" class="grid-desc" placeholder="例如：住宿費" style="width:96%; padding:4px;" required>
    </td>
    <td style="padding:4px; border:1px solid #ddd;">
      <input type="number" class="grid-amount" placeholder="0" style="width:90%; padding:4px;" min="0" required oninput="calculateVoucherTotal()">
    </td>
    <td style="padding:4px; border:1px solid #ddd;">
      <div style="display:flex; align-items:center; gap:5px;">
        <input type="text" class="grid-payee-id" placeholder="身分證/統編" style="width:60%; padding:4px;" onblur="fetchPayeeName(this)">
        <span class="grid-payee-name" style="font-size:12px; color:#666;"></span>
      </div>
    </td>
    <td style="padding:4px; border:1px solid #ddd; text-align:center;">
      <button type="button" class="danger" onclick="this.closest('tr').remove(); calculateVoucherTotal();">刪除</button>
    </td>
  `;
  tbody.appendChild(tr);
};

window.toggleInvoiceRequired = (selectEl) => {
    const input = selectEl.closest('tr').querySelector('.grid-inv-num');
    if (selectEl.value === '發票') {
        input.disabled = false;
        input.required = true;
        input.placeholder = "必填發票號碼";
    } else {
        input.disabled = true;
        input.required = false;
        input.value = "";
        input.placeholder = "可留空";
    }
};

window.calculateVoucherTotal = () => {
    const amounts = Array.from(document.querySelectorAll('.grid-amount')).map(el => Number(el.value) || 0);
    const total = amounts.reduce((a, b) => a + b, 0);
    const display = document.getElementById('voucherTotalDisplay');
    if(display) display.innerText = `$${total.toLocaleString()}`;
};

window.fetchPayeeName = (inputEl) => {
    const id = inputEl.value.trim();
    const nameSpan = inputEl.closest('td').querySelector('.grid-payee-name');
    if (!id) {
        nameSpan.innerText = '';
        return;
    }
    
    let fullName = id.length === 8 ? "廠商統一編號" : "李小白"; 
    
    if (fullName.length === 2) {
        nameSpan.innerText = fullName[0] + "O";
    } else if (fullName.length === 3) {
        nameSpan.innerText = fullName[0] + "O" + fullName[2];
    } else if (fullName.length >= 4) {
        nameSpan.innerText = fullName[0] + "O" + fullName.substring(2);
    } else {
        nameSpan.innerText = fullName;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const tbody = document.getElementById('excelLinesBody');
    if (tbody && tbody.children.length === 0) {
        for(let i=0; i<3; i++) window.addExcelRow();
    }
});

function maskName(name) {
  if (!name) return '';
  if (name.length <= 2) return name[0] + 'O';
  if (name.length === 3) return name[0] + 'O' + name[2];
  return name[0] + 'O'.repeat(name.length - 2) + name[name.length - 1];
}

async function mockFetchNameFromDB(idStr) {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (idStr === 'B223755666') resolve('李曉明'); 
      else if (idStr === 'R932012338') resolve('張曉嵐');
      else resolve('李大白');
    }, 400); 
  });
}

function loadState() {
  const saved = localStorage.getItem('my_app_state');
  let state = saved ? JSON.parse(saved) : { transactions: [] };

  if (state.transactions && state.transactions.length > 0) {
    const defaultIds = ['tx-1', 'tx-2', 'tx-3', 'tx-4', 'tx-5', 'tx-6', 'tx-7', 'tx-8', 'tx-9', 'tx-10', 'tx-11', 'tx-12', 'tx-13', 'tx-14'];
    state.transactions = state.transactions.filter(tx => !defaultIds.includes(tx.id));
    localStorage.setItem('my_app_state', JSON.stringify(state));
  }

  return state;
}

window.toggleInvoiceRequired = (selectEl) => {
    const input = selectEl.closest('tr').querySelector('.grid-inv-num');
    if (selectEl.value === '發票') {
        input.disabled = false;
        input.required = true;
        input.placeholder = "必填發票號碼";
    } else {
        input.disabled = true;
        input.required = false;
        input.value = "";
        input.placeholder = "可留空";
    }
};

window.calculateVoucherTotal = () => {
    const amounts = Array.from(document.querySelectorAll('.grid-amount')).map(el => Number(el.value) || 0);
    const total = amounts.reduce((a, b) => a + b, 0);
    const display = document.getElementById('voucherTotalDisplay');
    if(display) display.innerText = `$${total.toLocaleString()}`;
};

window.fetchPayeeName = (inputEl) => {
    const id = inputEl.value.trim();
    const nameSpan = inputEl.closest('td').querySelector('.grid-payee-name');
    if (!id) {
        nameSpan.innerText = '';
        return;
    }
    
    let fullName = id.length === 8 ? "廠商統一編號" : "李小白"; 
    
    if (fullName.length === 2) {
        nameSpan.innerText = fullName[0] + "O";
    } else if (fullName.length === 3) {
        nameSpan.innerText = fullName[0] + "O" + fullName[2];
    } else if (fullName.length >= 4) {
        nameSpan.innerText = fullName[0] + "O" + fullName.substring(2);
    } else {
        nameSpan.innerText = fullName;
    }
};

// 進入頁面時預設新增 3 列空白明細
document.addEventListener('DOMContentLoaded', () => {
    const tbody = document.getElementById('excelLinesBody');
    if (tbody && tbody.children.length === 0) {
        for(let i=0; i<3; i++) window.addExcelRow();
    }
});