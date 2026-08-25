import { supabase } from '../../../scripts/supabaseClient.js';
import { fetchMyVouchers, fetchWorkflowLogs, managerApprove, managerReject, accountingApprove, accountingReject, closeVoucherByAccounting } from './voucherApi.js';
import { getAttachmentsByVoucherId } from './attachments.js';
import { getStatusBadge, buildApprovalStepperHtml, buildMiniStepperDots, showMessage } from '../utils/uiHelpers.js';

/**
 * 渲染報支單簽核中心列表
 */
export async function renderVoucherWorkflowList() {
  const container = document.getElementById('voucherWorkflowList');
  if (!container) return;
  container.innerHTML = '<p class="muted">載入中…</p>';
  
  try {
    const vouchers = await fetchMyVouchers();
    
    if (vouchers.length === 0) {
      container.innerHTML = '<p class="muted">目前沒有任何報支申請。</p>';
      return;
    }

    const htmlContent = vouchers.map(row => {
      let actionButtons = '';
      const currentUserRole = window.state?.currentUser?.role; 
      const vStatus = row.status; 

      if (currentUserRole === 'employee') {
        if (['pending_review'].includes(vStatus)) {
          actionButtons = `
            <button class="btn-small secondary edit-voucher-btn" data-id="${row.id}">請求修正</button>
            <button class="btn-small danger cancel-voucher-btn" data-id="${row.id}">撤回</button>
          `;
        } else if (['manager_rejected', 'accounting_rejected'].includes(vStatus)) {
          actionButtons = `<button class="btn-small secondary" onclick="openResubmitModal('${row.id}')">修改並重送</button>`;
        }
      } 
      else if (currentUserRole === 'manager') {
        if (vStatus === 'pending_review') {
          actionButtons = `
            <button type="button" class="approve-voucher-btn" data-id="${row.id}" data-stage="manager">核准</button>
            <button type="button" class="reject-voucher-btn" data-id="${row.id}" data-stage="manager">退件</button>
          `;
        }
      } 
      else if (['accounting', 'admin'].includes(currentUserRole)) {
        if (vStatus === 'pending_accounting') {
          actionButtons = `
            <button class="btn-small success" onclick="openAccountingReviewModal('${row.id}')">
              詳細審核 & 歸帳
            </button>
            <button class="btn-small warning reject-voucher-btn" data-id="${row.id}" data-stage="accounting">退件</button>
          `;
        } else if (vStatus === 'approved') {
          actionButtons = `
            <button class="btn-small success close-voucher-btn" data-id="${row.id}" onclick="openCloseVoucherModal('${row.id}')">
              執行付款銷案
            </button>
          `;
        } else if (vStatus === 'closed') {
          actionButtons = `<button type="button" class="btn-small danger" onclick="openVoidVoucherModal('${row.id}')">銷案</button>`;
        }
      }

      return `
        <tr>
          <td><a href="javascript:void(0)" onclick="viewVoucherDetail('${row.id}')" style="color:#007bff; font-weight:bold; text-decoration:underline;">${row.voucher_no || '未編號'}</a></td>
          <td>${row.summary || '-'}</td>
          <td>${row.voucher_lines?.length || 0} 筆</td>
          <td style="text-align:right; font-variant-numeric:tabular-nums;">$${Number(row.total_amount || 0).toLocaleString()}</td>
          <td>${getStatusBadge(vStatus)}</td>
          <td>${buildMiniStepperDots(vStatus)}</td>
          <td style="white-space:nowrap;">${actionButtons}<button class="btn-small view-history-btn" data-id="${row.id}">查看歷程</button></td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div style="overflow-x:auto;">
      <table>
        <thead>
          <tr>
            <th>單號</th>
            <th>摘要</th>
            <th>筆數</th>
            <th style="text-align:right;">金額</th>
            <th>狀態</th>
            <th>進度</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${htmlContent}
        </tbody>
      </table>
      </div>
    `;

  } catch (error) {
    container.innerHTML = `<p class="muted">載入失敗：${error.message}</p>`;
  }
}

/**
 * 渲染單據卡片 (Dashboard 用)
 */
export function renderVoucherCard(v) {
  const role = window.state?.currentUser?.role;
  const isMine = v.applicant_id === window.state?.currentUser?.id;
  let actions = '';

  if (isMine && ['pending_review', 'manager_rejected', 'accounting_rejected'].includes(v.status)) {
    actions += `<span class="muted" style="font-size:12px;">可修改後重送（下一階段補上編輯介面）</span>`;
  }
  if (['manager', 'admin'].includes(role) && v.status === 'pending_review') {
    actions += `<button class="primary-btn" onclick="viewVoucherDetail('${v.id}')">查看並審核</button>
                <button class="danger reject-voucher-btn" data-id="${v.id}" data-stage="manager">退件</button>`;
  }
  if (['accounting', 'admin'].includes(role) && v.status === 'pending_accounting') {
    actions += `<button class="primary-btn approve-voucher-btn" data-id="${v.id}" data-stage="accounting">核准入帳</button>
                <button class="danger reject-voucher-btn" data-id="${v.id}" data-stage="accounting">退件</button>`;
  }

  return `
    <div class="voucher-card">
      <div class="voucher-card-header">
        <strong>${v.voucher_no || '（產生中）'}</strong>
        <span class="badge">${STATUS_LABELS[v.status] || v.status}</span>
      </div>
      <div class="muted">${v.tx_date}｜${v.summary || ''}｜金額 ${Number(v.total_amount).toLocaleString()}</div>
      <div class="button-row" style="margin-top:8px;">
        ${actions}
        ${actions.includes('view-history-btn') ? '' : `<button class="secondary view-history-btn" data-id="${v.id}">查看審批歷程</button>`}
      </div>
      <div class="voucher-history" id="history-${v.id}" style="display:none; margin-top:8px;"></div>
    </div>`;
}

