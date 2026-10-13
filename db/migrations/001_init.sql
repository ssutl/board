create extension if not exists vector;

create table items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('image', 'link')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  claimed_at timestamptz,
  attempts int not null default 0,
  error text,
  content_hash text unique,
  original_url text,
  image_url text,
  uncropped_url text,
  width int,
  height int,
  use_crop boolean not null default true,
  source_url text,
  title text,
  caption text,
  tags jsonb not null default '{}',
  embedding vector(1536),
  hidden boolean not null default false,
  blocked_source boolean not null default false
);

create index items_status_idx on items (status, created_at);
create index items_embedding_idx on items using hnsw (embedding vector_cosine_ops);

create table boards (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  cover_item_id uuid references items (id) on delete set null,
  centroid vector(1536) not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table board_items (
  board_id uuid not null references boards (id) on delete cascade,
  item_id uuid not null references items (id) on delete cascade,
  similarity real not null default 0,
  pinned boolean not null default false,
  excluded boolean not null default false,
  added_at timestamptz not null default now(),
  primary key (board_id, item_id)
);

create index board_items_item_idx on board_items (item_id);

create table suggestions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('split', 'merge')),
  payload jsonb not null,
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  fingerprint text not null unique,
  created_at timestamptz not null default now()
);

create table ai_usage (
  day date not null,
  purpose text not null check (purpose in ('pipeline', 'search')),
  calls int not null default 0,
  primary key (day, purpose)
);

create table settings (
  key text primary key,
  value text
);
