-- Run this once in your Supabase project's SQL Editor
-- (Supabase dashboard -> SQL Editor -> New query -> paste -> Run).
--
-- This is only used for a lightweight "which rooms have been used" log —
-- the actual call signaling (offer/answer/ICE) goes over Supabase Realtime
-- Presence/Broadcast and never touches these tables.

create table if not exists rooms (
  name text primary key,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create table if not exists room_events (
  id bigint generated always as identity primary key,
  room_name text not null references rooms(name) on delete cascade,
  peer_id text not null,
  event text not null check (event in ('join', 'leave')),
  created_at timestamptz not null default now()
);

alter table rooms enable row level security;
alter table room_events enable row level security;

drop policy if exists "public read rooms" on rooms;
create policy "public read rooms" on rooms for select using (true);

drop policy if exists "public insert rooms" on rooms;
create policy "public insert rooms" on rooms for insert with check (true);

drop policy if exists "public update rooms" on rooms;
create policy "public update rooms" on rooms for update using (true);

drop policy if exists "public read room_events" on room_events;
create policy "public read room_events" on room_events for select using (true);

drop policy if exists "public insert room_events" on room_events;
create policy "public insert room_events" on room_events for insert with check (true);
