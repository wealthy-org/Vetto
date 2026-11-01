create table if not exists user_chat_history (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references users(id) on delete cascade,
  prompt     text        not null check (char_length(prompt) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists user_chat_history_user_created
  on user_chat_history (user_id, created_at desc, id desc);
create index if not exists idempotency_keys_expires_at on idempotency_keys (expires_at);
