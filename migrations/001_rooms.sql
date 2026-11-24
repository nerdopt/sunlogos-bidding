create table if not exists rooms (
  code text primary key,
  host_token text not null,
  version integer not null default 0,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists rooms_updated_at on rooms (updated_at);
