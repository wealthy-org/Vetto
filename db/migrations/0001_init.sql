-- PostgreSQL only (NeonDB). No Redis: rate limits, idempotency and the job queue (pg-boss) live here.
create table if not exists rate_limits (
  key          text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 1,
  primary key (key, window_start)
);
create index if not exists rate_limits_window_start on rate_limits (window_start);

create table if not exists idempotency_keys (
  key         text primary key,
  user_id     uuid        not null,
  request_hash text       not null,
  response    jsonb,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '24 hours'
);

-- Append-only. Never store secrets, seed phrases, private keys or raw browser profiles.
create table if not exists audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  user_id     uuid,
  action      text        not null,
  intent_kind text,
  decision    text,
  meta        jsonb       not null default '{}'::jsonb
);
create index if not exists audit_log_user_at on audit_log (user_id, at desc);
