alter table public.bank_transactions
  add column if not exists transaction_no text,
  add column if not exists counterparty text,
  add column if not exists category text,
  add column if not exists remark text,
  add column if not exists attachment_id text;

create unique index if not exists bank_transactions_transaction_no_key
  on public.bank_transactions(transaction_no)
  where transaction_no is not null;
