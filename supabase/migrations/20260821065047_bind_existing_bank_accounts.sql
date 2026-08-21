update public.bank_accounts
set ledger_account_id = account.id,
    accounting_account_id = account.id
from public.accounts account
where account.code = '1102'
  and (
    bank_accounts.ledger_account_id is null
    or bank_accounts.accounting_account_id is null
  );
