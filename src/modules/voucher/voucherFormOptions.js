import supabase from '../../../scripts/supabaseClient.js';
import { showMessage } from '../utils/uiHelpers.js';
import { fetchAccounts, fetchBankAccounts, fetchDepartments } from '../voucherApi.js';
import { fetchProjects } from '../project/project.js';

export async function populateVoucherFormOptions() {
  try {
    const [accounts, banks, departments] = await Promise.all([
      fetchAccounts(), fetchBankAccounts(), fetchDepartments()
    ]);

    window.__cachedAccounts = accounts;

    // 控制會計專用區塊顯示
    const role = window.state.currentUser?.role;
    const acctGroup = document.getElementById('accountingFieldsGroup');
    if (acctGroup) {
        acctGroup.style.display = ['accounting', 'admin', 'super_admin'].includes(role) ? 'flex' : 'none';
    }

    // 初始進入此頁面時，預設給 5 個空列
    const tbody = document.getElementById('excelLinesBody');
    if (tbody && tbody.children.length === 0) {
        for(let i=0; i<5; i++) window.addExcelRow();
    }

    // 會計科目
    const accountSelect = document.getElementById('vAccountCode');
    if (accountSelect) {
      accountSelect.innerHTML = accounts.map(a => 
        `<option value="${a.code}">${a.code} ${a.name}</option>`
      ).join('');
    }

    // 銀行帳戶
    const bankSelect = document.getElementById('vBankAccount');
    if (bankSelect) {
      bankSelect.innerHTML = '<option value="">（現金支付免選）</option>' + 
        banks.map(b => `<option value="${b.id}">${b.nickname || b.bank_name}</option>`).join('');
    }
    
    // 部門 - 避免重複宣告
    const deptSelect = document.getElementById('vDepartment');
    if (deptSelect) {
      if (window.state.currentUser?.role === 'employee') {
        // 員工只能看到自己的部門
        deptSelect.innerHTML = `<option value="${window.state.currentUser.department_id || ''}">${window.state.currentUser.department_name || '我的部門'}</option>`;
        deptSelect.disabled = true;
      } else {
        deptSelect.innerHTML = departments.length
          ? departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('')
          : '<option value="">尚未建立部門</option>';
      }
      // 部門選好之後，主動載入該部門的人，不用等使用者手動觸發
      await loadDepartmentPeople(deptSelect.value);
    }

    const projectSelect = document.getElementById('vProject');
    if (projectSelect) {
      const projects = await fetchProjects();
      projectSelect.innerHTML = '<option value="">無專案</option>' + 
        projects.map(p => `<option value="${p.id}">${p.project_code} - ${p.name}</option>`).join('');
    }

    // 部門下拉一改變，還是可以重新整理一次（保留原本互動）
    async function loadDepartmentPeople(deptId) {
      const managerSelect = document.getElementById('vManagerPicker');
      if (!managerSelect) return;
      managerSelect.dataset.departmentId = '';
      managerSelect.dataset.managerCount = '';
      managerSelect.innerHTML = '<option value="">正在載入部門主管…</option>';

      if (!deptId) {
        managerSelect.innerHTML = '<option value="">請先選擇部門</option>';
        return;
      }

      const { data: people, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('department_id', deptId)
        .eq('role', 'manager');

      if (document.getElementById('vDepartment')?.value !== deptId) return;
      managerSelect.dataset.departmentId = deptId;
      managerSelect.dataset.managerCount = error ? '0' : String(people?.length || 0);

      if (error || !people || people.length === 0) {
        managerSelect.innerHTML = error
          ? '<option value="">主管名單載入失敗，請重試</option>'
          : '<option value="">此部門尚無主管，請聯絡管理員設定</option>';
        return;
      }

      const strokeSort = new Intl.Collator('zh-Hant-u-co-stroke');
      const sorted = [...people].sort((a, b) => strokeSort.compare(a.full_name || '', b.full_name || ''));

      managerSelect.innerHTML = '<option value="">不指定（整個部門主管都能審）</option>' +
        sorted.map(p => `<option value="${p.id}">${p.full_name || '未命名主管'}（主管）</option>`).join('');
    }

    document.getElementById('vDepartment')?.addEventListener('change', (e) => {
      loadDepartmentPeople(e.target.value);
    });

  } catch (error) {
    console.error(error);
    showMessage(`載入表單選項失敗：${error.message}`, true);
  }
}
