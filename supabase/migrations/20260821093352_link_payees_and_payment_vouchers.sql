alter table public.payment_recipients
  add column if not exists payee_id uuid references public.payees(id) on delete set null;

alter table public.payment_recipients
  alter column bank_name drop not null,
  alter column account_name drop not null,
  alter column account_number drop not null;

create unique index if not exists payment_recipients_payee_id_key
  on public.payment_recipients(payee_id)
  where payee_id is not null;

alter table public.vouchers
  add column if not exists primary_payee_id uuid references public.payees(id) on delete set null;

create index if not exists idx_vouchers_primary_payee_id
  on public.vouchers(primary_payee_id);

alter table public.voucher_payments
  add column if not exists payment_no text,
  add column if not exists recipient_snapshot jsonb,
  add column if not exists recorded_at timestamptz not null default now();

create unique index if not exists voucher_payments_payment_no_key
  on public.voucher_payments(payment_no)
  where payment_no is not null;

create sequence if not exists public.payment_voucher_number_seq;
revoke all on sequence public.payment_voucher_number_seq from public, anon, authenticated;

create or replace function public.sync_voucher_payee_to_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payee public.payees%rowtype;
  v_recipient_id uuid;
  v_bank_code text;
  v_account_number text;
begin
  if nullif(trim(new.payee_identifier), '') is null then
    return new;
  end if;

  select * into v_payee
  from public.payees
  where identifier = trim(new.payee_identifier)
    and coalesce(is_active, true)
  limit 1;

  if not found then
    return new;
  end if;

  if position('-' in coalesce(v_payee.bank_account, '')) > 0 then
    v_bank_code := split_part(v_payee.bank_account, '-', 1);
    v_account_number := substring(v_payee.bank_account from position('-' in v_payee.bank_account) + 1);
  else
    v_account_number := nullif(v_payee.bank_account, '');
  end if;

  insert into public.payment_recipients (
    payee_id, display_name, identifier, bank_branch, account_name,
    account_number, contact_name, phone, email, active
  ) values (
    v_payee.id, v_payee.name, v_payee.identifier, v_bank_code, v_payee.name,
    v_account_number, v_payee.name, v_payee.phone, v_payee.email, true
  )
  on conflict (payee_id) where payee_id is not null do update
  set display_name = excluded.display_name,
      identifier = excluded.identifier,
      bank_branch = coalesce(public.payment_recipients.bank_branch, excluded.bank_branch),
      account_name = coalesce(public.payment_recipients.account_name, excluded.account_name),
      account_number = coalesce(public.payment_recipients.account_number, excluded.account_number),
      contact_name = coalesce(public.payment_recipients.contact_name, excluded.contact_name),
      phone = coalesce(public.payment_recipients.phone, excluded.phone),
      email = coalesce(public.payment_recipients.email, excluded.email),
      updated_at = now()
  returning id into v_recipient_id;

  update public.vouchers
  set primary_payee_id = coalesce(primary_payee_id, v_payee.id),
      payment_recipient_id = coalesce(payment_recipient_id, v_recipient_id),
      updated_at = now()
  where id = new.voucher_id;

  return new;
end;
$$;

revoke all on function public.sync_voucher_payee_to_payment() from public, anon, authenticated;

drop trigger if exists voucher_line_sync_payment_recipient on public.voucher_lines;
create trigger voucher_line_sync_payment_recipient
after insert or update of payee_identifier on public.voucher_lines
for each row execute function public.sync_voucher_payee_to_payment();

create or replace function public.prepare_payment_voucher()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient public.payment_recipients%rowtype;
  v_payment_date date := coalesce(new.paid_at, current_date);
begin
  if new.payment_no is null then
    new.payment_no := 'PAY-' || to_char(v_payment_date, 'YYYYMMDD') || '-' ||
      lpad(nextval('public.payment_voucher_number_seq')::text, 6, '0');
  end if;

  if new.recipient_snapshot is null and new.payment_recipient_id is not null then
    select * into v_recipient
    from public.payment_recipients
    where id = new.payment_recipient_id;

    if found then
      new.recipient_snapshot := jsonb_build_object(
        'display_name', v_recipient.display_name,
        'identifier', v_recipient.identifier,
        'bank_name', v_recipient.bank_name,
        'bank_branch', v_recipient.bank_branch,
        'account_name', v_recipient.account_name,
        'account_number', v_recipient.account_number
      );
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prepare_payment_voucher() from public, anon, authenticated;

drop trigger if exists voucher_payment_prepare_receipt on public.voucher_payments;
create trigger voucher_payment_prepare_receipt
before insert on public.voucher_payments
for each row execute function public.prepare_payment_voucher();

update public.voucher_payments
set payment_no = 'PAY-' || to_char(coalesce(paid_at, current_date), 'YYYYMMDD') || '-' ||
  upper(substr(replace(id::text, '-', ''), 1, 8))
where payment_no is null;

update public.voucher_payments payment
set recipient_snapshot = jsonb_build_object(
  'display_name', recipient.display_name,
  'identifier', recipient.identifier,
  'bank_name', recipient.bank_name,
  'bank_branch', recipient.bank_branch,
  'account_name', recipient.account_name,
  'account_number', recipient.account_number
)
from public.payment_recipients recipient
where recipient.id = payment.payment_recipient_id
  and payment.recipient_snapshot is null;

-- Backfill links from existing reimbursement lines without embedding local payee data in code.
update public.voucher_lines
set payee_identifier = payee_identifier
where nullif(trim(payee_identifier), '') is not null;

