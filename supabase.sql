-- Run once in the Supabase SQL editor.
create table if not exists subscribers (
  chat_id bigint primary key,
  created_at timestamptz default now()
);

create table if not exists watch_state (
  id text primary key,
  payload text not null,
  updated_at timestamptz default now()
);

create table if not exists sent_alerts (
  key text primary key,
  sent_at timestamptz default now()
);

-- Row Level Security: deny-by-default.
--
-- Claxon's server (src/lib/store.ts) connects with the service_role key, which
-- bypasses RLS, so it keeps full access and needs no policies. Enabling RLS with
-- NO policies means the public `anon` key — which is meant to be shipped in
-- browsers — can read and write nothing. That matters most for `subscribers`,
-- which holds Telegram chat IDs (personal data).
--
-- If a public read-only dashboard is ever added, grant it narrowly here, and
-- never over `subscribers`.
alter table subscribers enable row level security;
alter table watch_state enable row level security;
alter table sent_alerts enable row level security;
