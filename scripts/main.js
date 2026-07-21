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

window.addExcelRow = () => {
  const tbody = document.getElementById('excelLinesBody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td style="padding:4px; border:1px solid #ddd;"><input type="text" class="grid-desc" placeholder="摘要說明" style="width:96%; padding:4px;" required></td>
    <td style="padding:4px; border:1px solid #ddd;">
      <select class="grid-inv-type" style="width:100%; padding:4px;" onchange="toggleInvoiceNum(this)">
        <option value="無">無</option>
        <option value="發票" selected>發票</option>
        <option value="收據">收據</option>
      </select>
    </td>
    <td style="padding:4px; border:1px solid #ddd;"><input type="text" class="grid-inv-num" placeholder="請填寫發票號碼" style="width:90%; padding:4px;" required></td>
    <td style="padding:4px; border:1px solid #ddd;"><input type="number" class="grid-price" placeholder="單價" style="width:90%; padding:4px;" min="0" oninput="calculateRowTotal(this)"></td>
    <td style="padding:4px; border:1px solid #ddd;"><input type="number" class="grid-qty" placeholder="數量" style="width:90%; padding:4px;" min="1" value="1" oninput="calculateRowTotal(this)"></td>
    <td style="padding:4px; border:1px solid #ddd;"><input type="number" class="grid-amount" placeholder="總金額" style="width:90%; padding:4px;" min="0"></td>
    <td style="padding:4px; border:1px solid #ddd; text-align:center;"><button type="button" class="danger" onclick="this.closest('tr').remove()">刪除</button></td>
  `;
  tbody.appendChild(tr);
};

// 憑證類別連動檢查（選擇發票時強制填寫發票號碼）
window.toggleInvoiceNum = (selectEl) => {
  const row = selectEl.closest('tr');
  const invNumInput = row.querySelector('.grid-inv-num');
  if (selectEl.value === '發票' || selectEl.value === '收據') {
    invNumInput.setAttribute('required', 'true');
    invNumInput.placeholder = '必填憑證號碼';
  } else {
    invNumInput.removeAttribute('required');
    invNumInput.placeholder = '可留空';
  }
};

// 自動計算總金額，允許手動誤差調整
window.calculateRowTotal = (element) => {
  const row = element.closest('tr');
  const price = parseFloat(row.querySelector('.grid-price').value) || 0;
  const qty = parseFloat(row.querySelector('.grid-qty').value) || 1;
  const amountInput = row.querySelector('.grid-amount');
  
  // 自動幫忙計算總金額，使用者亦可手動覆寫調整誤差
  amountInput.value = price * qty;
};