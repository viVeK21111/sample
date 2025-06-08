-- Users table: stores user_id, session_id, created_at
create table if not exists users (
  user_id text not null,
  session_id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Sessions table: stores session_id, query, datatext, created_at
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references users(session_id) on delete cascade,
  query text not null,
  datatext text,
  created_at timestamp with time zone default timezone('utc'::text, now())
); 