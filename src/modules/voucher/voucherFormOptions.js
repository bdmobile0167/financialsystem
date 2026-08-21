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
        acctGroup.style.display = ['accounting', 'admin'].includes(role) ? 'flex' : 'none';
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
    
    await populateManagerPickerGrouped();
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

    async function populateManagerPickerGrouped() {
      const managerSelect = document.getElementById('vManagerPicker');
      if (!managerSelect) return;

      const { data: managers, error } = await supabase
        .from('profiles')
        .select('id, full_name, department_id, departments(name)')
        .eq('role', 'manager');

      if (error || !managers) {
        managerSelect.innerHTML = '<option value="">不指定</option>';
        return;
      }

      const strokeSort = new Intl.Collator('zh-Hant-u-co-stroke');
      const grouped = {};
      managers.forEach(m => {
        const deptName = m.departments?.name || '未分配部門';
        if (!grouped[deptName]) grouped[deptName] = [];
        grouped[deptName].push(m);
      });

      let html = '<option value="">不指定（整個部門主管都能審）</option>';
      Object.keys(grouped).sort(strokeSort.compare).forEach(deptName => {
        const people = grouped[deptName].sort((a, b) => strokeSort.compare(a.full_name, b.full_name));
        html += `<optgroup label="${deptName}">`;
        html += people.map(m => `<option value="${m.id}">${m.full_name}</option>`).join('');
        html += `</optgroup>`;
      });

      managerSelect.innerHTML = html;
    }

    // 部門下拉一改變，還是可以重新整理一次（保留原本互動）
    async function loadDepartmentPeople(deptId) {
      const managerSelect = document.getElementById('vManagerPicker');
      if (!managerSelect) return;

      if (!deptId) {
        managerSelect.innerHTML = '<option value="">請先選擇部門</option>';
        return;
      }

      const { data: people, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('department_id', deptId);

      if (error || !people || people.length === 0) {
        managerSelect.innerHTML = '<option value="">此部門尚無人員資料</option>';
        return;
      }

      const strokeSort = new Intl.Collator('zh-Hant-u-co-stroke');
      const sorted = [...people].sort((a, b) => strokeSort.compare(a.full_name || '', b.full_name || ''));

      const ROLE_LABEL = { manager: '主管', accounting: '會計', admin: '管理員', employee: '專員' };
      managerSelect.innerHTML = '<option value="">不指定（整個部門主管都能審）</option>' +
        sorted.map(p => `<option value="${p.id}">${p.full_name}${p.role === 'manager' ? '（主管）' : ` (${ROLE_LABEL[p.role] || p.role})`}</option>`).join('');
    }

    document.getElementById('vDepartment')?.addEventListener('change', (e) => {
      loadDepartmentPeople(e.target.value);
    });

  } catch (error) {
    console.error(error);
    showMessage(`載入表單選項失敗：${error.message}`, true);
  }
}
