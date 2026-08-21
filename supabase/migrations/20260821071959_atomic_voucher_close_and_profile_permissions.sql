create or replace function public.log_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     or new.department_id is distinct from old.department_id
     or new.active is distinct from old.active
     or new.permissions is distinct from old.permissions then
    insert into public.audit_logs (user_id, action, table_name, record_id, old_data, new_data)
    values (
      auth.uid(),
      'profile_update',
      'profiles',
      new.id,
      jsonb_build_object(
        'role', old.role,
        'department_id', old.department_id,
        'active', old.active,
        'permissions', old.permissions
      ),
      jsonb_build_object(
        'role', new.role,
        'department_id', new.department_id,
        'active', new.active,
        'permissions', new.permissions
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function public.log_profile_change() from public, anon, authenticated;

-- These helpers only return the signed-in user's own role/department. Profile
-- RLS policies are defined for public, so every API role that evaluates them
-- must be allowed to execute the helpers.
grant execute on function public.get_my_role() to authenticator, authenticated, service_role;
grant execute on function public.get_my_department() to authenticator, authenticated, service_role;

create or replace function public.close_voucher_by_accounting(
  p_voucher_id uuid,
  p_debit_account text,
  p_bank_account_id uuid,
  p_payment_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_voucher public.vouchers%rowtype;
  v_debit_account_id uuid;
  v_credit_account_id uuid;
  v_journal_entry_id uuid;
begin
  select role into v_actor_role
  from public.profiles
  where id = auth.uid();

  if v_actor_role is null or v_actor_role not in ('admin', 'accounting') then
    raise exception 'Only accounting or admin users can close vouchers';
  end if;

  select * into v_voucher
  from public.vouchers
  where id = p_voucher_id
  for update;

  if not found then
    raise exception 'Voucher not found';
  end if;

  if v_voucher.status = 'closed' then
    insert into public.voucher_payments (
      voucher_id, payment_type, bank_account_id, amount, paid_at
    )
    select
      v_voucher.id, 'bank_transfer', bank_tx.bank_account_id,
      v_voucher.total_amount, coalesce(v_voucher.payment_date, bank_tx.tx_date)
    from public.bank_transactions bank_tx
    where bank_tx.voucher_id = v_voucher.id
      and not exists (
        select 1 from public.voucher_payments payment
        where payment.voucher_id = v_voucher.id
      )
    order by bank_tx.created_at
    limit 1;

    return jsonb_build_object('success', true, 'status', 'closed', 'idempotent', true);
  end if;

  if v_voucher.status <> 'approved' then
    raise exception 'Only approved vouchers can be closed';
  end if;

  if p_debit_account ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into v_debit_account_id
    from public.accounts
    where id = p_debit_account::uuid;
  else
    select id into v_debit_account_id
    from public.accounts
    where code = p_debit_account;
  end if;

  if v_debit_account_id is null then
    raise exception 'Debit account not found';
  end if;

  select coalesce(bank.ledger_account_id, bank.accounting_account_id)
  into v_credit_account_id
  from public.bank_accounts bank
  where bank.id = p_bank_account_id;

  if v_credit_account_id is null then
    select id into v_credit_account_id
    from public.accounts
    where code = '1102';
  end if;

  if v_credit_account_id is null then
    raise exception 'Bank ledger account not found';
  end if;

  select id into v_journal_entry_id
  from public.journal_entries
  where voucher_id = v_voucher.id
  order by created_at
  limit 1;

  if v_journal_entry_id is null then
    insert into public.journal_entries (
      voucher_id, debit_account_id, credit_account_id,
      debit_amount, credit_amount, entry_date, memo
    ) values (
      v_voucher.id, v_debit_account_id, v_credit_account_id,
      v_voucher.total_amount, v_voucher.total_amount, p_payment_date,
      '報支單核銷結案：' || coalesce(v_voucher.summary, v_voucher.voucher_no, '')
    );
  else
    update public.journal_entries
    set debit_account_id = v_debit_account_id,
        credit_account_id = v_credit_account_id,
        debit_amount = v_voucher.total_amount,
        credit_amount = v_voucher.total_amount,
        entry_date = p_payment_date,
        memo = '報支單核銷結案：' || coalesce(v_voucher.summary, v_voucher.voucher_no, '')
    where id = v_journal_entry_id;
  end if;

  if exists (
    select 1 from public.bank_transactions
    where voucher_id = v_voucher.id
  ) then
    update public.bank_transactions
    set bank_account_id = p_bank_account_id,
        tx_date = p_payment_date,
        type = '支出',
        amount = v_voucher.total_amount,
        description = '報支單核銷結案：' || coalesce(v_voucher.summary, v_voucher.voucher_no, '')
    where voucher_id = v_voucher.id;
  else
    insert into public.bank_transactions (
      bank_account_id, tx_date, type, amount, voucher_id, description
    ) values (
      p_bank_account_id, p_payment_date, '支出', v_voucher.total_amount,
      v_voucher.id,
      '報支單核銷結案：' || coalesce(v_voucher.summary, v_voucher.voucher_no, '')
    );
  end if;

  if exists (
    select 1 from public.voucher_payments
    where voucher_id = v_voucher.id
  ) then
    update public.voucher_payments
    set payment_type = 'bank_transfer',
        bank_account_id = p_bank_account_id,
        amount = v_voucher.total_amount,
        paid_at = p_payment_date
    where voucher_id = v_voucher.id;
  else
    insert into public.voucher_payments (
      voucher_id, payment_type, bank_account_id, amount, paid_at
    ) values (
      v_voucher.id, 'bank_transfer', p_bank_account_id,
      v_voucher.total_amount, p_payment_date
    );
  end if;

  update public.vouchers
  set status = 'closed',
      payment_date = p_payment_date,
      closed_at = now(),
      updated_at = now()
  where id = v_voucher.id;

  return jsonb_build_object('success', true, 'status', 'closed', 'idempotent', false);
end;
$$;

revoke all on function public.close_voucher_by_accounting(uuid, text, uuid, date)
from public, anon;
grant execute on function public.close_voucher_by_accounting(uuid, text, uuid, date)
to authenticated;

-- Repair closed vouchers left without a payment row by the former multi-call flow.
insert into public.voucher_payments (
  voucher_id, payment_type, bank_account_id, amount, paid_at
)
select
  voucher.id,
  'bank_transfer',
  bank_tx.bank_account_id,
  voucher.total_amount,
  coalesce(voucher.payment_date, bank_tx.tx_date)
from public.vouchers voucher
join lateral (
  select bank_account_id, tx_date
  from public.bank_transactions
  where voucher_id = voucher.id
  order by created_at
  limit 1
) bank_tx on true
where voucher.status = 'closed'
  and not exists (
    select 1 from public.voucher_payments payment
    where payment.voucher_id = voucher.id
  );
