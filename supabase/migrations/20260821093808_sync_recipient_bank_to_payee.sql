create or replace function public.sync_payment_recipient_to_payee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payee_id is not null and (
    old.bank_branch is distinct from new.bank_branch or
    old.account_number is distinct from new.account_number
  ) then
    update public.payees
    set bank_account = case
      when nullif(trim(new.bank_branch), '') is not null and nullif(trim(new.account_number), '') is not null
        then trim(new.bank_branch) || '-' || trim(new.account_number)
      else coalesce(nullif(trim(new.account_number), ''), nullif(trim(new.bank_branch), ''))
    end
    where id = new.payee_id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_payment_recipient_to_payee() from public, anon, authenticated;

drop trigger if exists payment_recipient_sync_payee_bank on public.payment_recipients;
create trigger payment_recipient_sync_payee_bank
after update of bank_branch, account_number on public.payment_recipients
for each row execute function public.sync_payment_recipient_to_payee();
