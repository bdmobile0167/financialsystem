create table if not exists public.payment_recipients (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  identifier text,
  bank_name text not null,
  bank_branch text,
  account_name text not null,
  account_number text not null,
  contact_name text,
  phone text,
  email text,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

alter table public.payment_recipients enable row level security;

create policy "payment recipients finance read"
on public.payment_recipients for select to authenticated
using (public.get_my_role() = any (array['admin'::text, 'accounting'::text]));

create policy "payment recipients finance write"
on public.payment_recipients for all to authenticated
using (public.get_my_role() = any (array['admin'::text, 'accounting'::text]))
with check (public.get_my_role() = any (array['admin'::text, 'accounting'::text]));

grant select, insert, update, delete on public.payment_recipients to authenticated;

alter table public.vouchers
  add column if not exists accounting_account_id uuid references public.accounts(id),
  add column if not exists payment_bank_account_id uuid references public.bank_accounts(id),
  add column if not exists payment_recipient_id uuid references public.payment_recipients(id),
  add column if not exists accounting_note text,
  add column if not exists accounting_approved_at timestamptz,
  add column if not exists accounting_approved_by uuid references public.profiles(id);

alter table public.voucher_payments
  add column if not exists payment_recipient_id uuid references public.payment_recipients(id),
  add column if not exists processed_by uuid references public.profiles(id);

create index if not exists idx_vouchers_payment_recipient_id
on public.vouchers(payment_recipient_id);
create index if not exists idx_vouchers_payment_bank_account_id
on public.vouchers(payment_bank_account_id);
create index if not exists idx_voucher_payments_payment_recipient_id
on public.voucher_payments(payment_recipient_id);

-- Approval only moves a voucher into the payment queue. Journal entries are
-- produced by close_voucher_by_accounting after money is actually paid.
drop trigger if exists voucher_approved_to_journal on public.vouchers;

create or replace function public.get_invite_caller_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

revoke all on function public.get_invite_caller_role() from public, anon;
grant execute on function public.get_invite_caller_role() to authenticated;

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
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_voucher public.vouchers%rowtype;
  v_debit_account_id uuid;
  v_credit_account_id uuid;
  v_journal_entry_id uuid;
begin
  select role into v_actor_role
  from public.profiles
  where id = v_actor_id;

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
    return jsonb_build_object('success', true, 'status', 'closed', 'idempotent', true);
  end if;

  if v_voucher.status <> 'approved' then
    raise exception 'Only accounting-approved vouchers can be paid';
  end if;

  if p_debit_account ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into v_debit_account_id from public.accounts where id = p_debit_account::uuid;
  else
    select id into v_debit_account_id from public.accounts where code = p_debit_account;
  end if;

  if v_debit_account_id is null then
    raise exception 'Debit account not found';
  end if;

  select coalesce(bank.ledger_account_id, bank.accounting_account_id)
  into v_credit_account_id
  from public.bank_accounts bank
  where bank.id = p_bank_account_id;

  if v_credit_account_id is null then
    select id into v_credit_account_id from public.accounts where code = '1102';
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
      '報支單付款入帳：' || coalesce(v_voucher.summary, v_voucher.voucher_no, '')
    );
  else
    update public.journal_entries
    set debit_account_id = v_debit_account_id,
        credit_account_id = v_credit_account_id,
        debit_amount = v_voucher.total_amount,
        credit_amount = v_voucher.total_amount,
        entry_date = p_payment_date,
        memo = '報支單付款入帳：' || coalesce(v_voucher.summary, v_voucher.voucher_no, '')
    where id = v_journal_entry_id;
  end if;

  insert into public.bank_transactions (
    bank_account_id, tx_date, type, amount, voucher_id, description
  )
  select
    p_bank_account_id, p_payment_date, '支出', v_voucher.total_amount,
    v_voucher.id, '報支單付款：' || coalesce(v_voucher.summary, v_voucher.voucher_no, '')
  where not exists (
    select 1 from public.bank_transactions where voucher_id = v_voucher.id
  );

  insert into public.voucher_payments (
    voucher_id, payment_type, bank_account_id, amount, paid_at,
    payment_recipient_id, processed_by
  )
  select
    v_voucher.id, 'bank_transfer', p_bank_account_id,
    v_voucher.total_amount, p_payment_date,
    v_voucher.payment_recipient_id, v_actor_id
  where not exists (
    select 1 from public.voucher_payments where voucher_id = v_voucher.id
  );

  update public.vouchers
  set status = 'closed',
      accounting_account_id = v_debit_account_id,
      payment_bank_account_id = p_bank_account_id,
      payment_date = p_payment_date,
      closed_at = now(),
      updated_at = now()
  where id = v_voucher.id;

  insert into public.notifications (user_id, title, message, voucher_id)
  select distinct recipient.user_id,
    '專案報支款項已付款',
    coalesce(v_voucher.summary, v_voucher.voucher_no, '') ||
      '，金額 NT$ ' || to_char(v_voucher.total_amount, 'FM999,999,999,990'),
    v_voucher.id
  from (
    select v_voucher.applicant_id as user_id
    union
    select member.user_id
    from public.project_members member
    where member.project_id = v_voucher.project_id
  ) recipient
  where recipient.user_id is not null;

  return jsonb_build_object('success', true, 'status', 'closed', 'idempotent', false);
end;
$$;

revoke all on function public.close_voucher_by_accounting(uuid, text, uuid, date)
from public, anon;
grant execute on function public.close_voucher_by_accounting(uuid, text, uuid, date)
to authenticated;

-- Preserve existing payment assignments for historical closed vouchers.
update public.vouchers voucher
set payment_bank_account_id = payment.bank_account_id,
    accounting_account_id = journal.debit_account_id
from public.voucher_payments payment
left join public.journal_entries journal on journal.voucher_id = payment.voucher_id
where payment.voucher_id = voucher.id
  and voucher.status = 'closed'
  and (voucher.payment_bank_account_id is null or voucher.accounting_account_id is null);
