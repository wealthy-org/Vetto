create table if not exists users (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists wallet_identities (
  chain_id     bigint      not null,
  address      text        not null check (address ~ '^0x[0-9a-f]{40}$'),
  user_id      uuid        not null references users(id),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (chain_id, address)
);
create index if not exists wallet_identities_user on wallet_identities (user_id);

create table if not exists wallet_auth_challenges (
  id         uuid        primary key,
  chain_id   bigint      not null,
  address    text        not null check (address ~ '^0x[0-9a-f]{40}$'),
  message    text        not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index if not exists wallet_auth_challenges_expiry on wallet_auth_challenges (expires_at);

create table if not exists user_sessions (
  id         uuid        primary key,
  user_id    uuid        not null references users(id),
  token_hash text        not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index if not exists user_sessions_user_expiry on user_sessions (user_id, expires_at desc);
