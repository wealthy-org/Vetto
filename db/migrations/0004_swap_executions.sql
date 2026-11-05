-- Execution records for the review → sign → receipt loop.
-- Only metadata the server itself derived is stored: never calldata supplied by a
-- client, never wallet secrets. The payload column is the exact unsigned
-- transaction the server handed to the user's wallet.

create table if not exists swap_executions (
  id                     uuid        primary key,
  user_id                uuid        not null references users(id) on delete cascade,
  chain_id               bigint      not null,
  status                 text        not null check (status in ('prepared','submitted','confirmed','reverted','expired')),
  token_in               text        not null,
  token_out              text        not null,
  amount_in_base_units   numeric(78,0) not null check (amount_in_base_units > 0),
  venue_id               text        not null,
  slippage_bps           integer     not null check (slippage_bps between 0 and 9999),
  expected_out_base_units numeric(78,0) not null check (expected_out_base_units > 0),
  min_out_base_units     numeric(78,0) not null check (min_out_base_units > 0),
  quote_fingerprint      text        not null check (quote_fingerprint ~ '^[0-9a-f]{64}$'),
  payload_hash           text        not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  payload                jsonb       not null,
  tx_hash                text        check (tx_hash is null or tx_hash ~ '^0x[0-9a-f]{64}$'),
  block_number           numeric(78,0),
  gas_used               numeric(78,0),
  error                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  confirmed_at           timestamptz
);

create index if not exists swap_executions_user_created
  on swap_executions (user_id, created_at desc, id desc);
create index if not exists swap_executions_tx_hash
  on swap_executions (tx_hash);
