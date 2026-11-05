-- Which wallet the session was created with, for the account chip in the app.
-- This is a display label only: it is submitted by the client, validated against a
-- closed allowlist server-side, and never used for any authorization decision.
alter table user_sessions add column if not exists connector text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_sessions_connector_check'
  ) then
    alter table user_sessions
      add constraint user_sessions_connector_check
      check (connector is null or connector in ('phantom','metamask','rabby','coinbase','walletconnect','injected'));
  end if;
end $$;
