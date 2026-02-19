-- MilkySync MVP schema (Supabase/Postgres)

create extension if not exists "pgcrypto";

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  family_id uuid references public.families(id) on delete set null,
  role text not null check (role in ('mother', 'partner', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pump_sessions (
  id uuid primary key,
  timestamp_ms bigint not null,
  left_ml integer not null check (left_ml >= 0),
  right_ml integer not null check (right_ml >= 0),
  total_ml integer not null check (total_ml >= 0),
  note text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  deleted_at timestamptz
);

create index if not exists idx_pump_sessions_family_updated
  on public.pump_sessions (family_id, updated_at desc);

create table if not exists public.reminder_settings (
  id uuid primary key,
  user_id uuid unique not null references public.profiles(id) on delete cascade,
  interval_minutes integer not null default 120,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.family_invites (
  code text primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.families enable row level security;
alter table public.profiles enable row level security;
alter table public.pump_sessions enable row level security;
alter table public.reminder_settings enable row level security;
alter table public.family_invites enable row level security;

-- Simplified MVP policies. Tighten for production later.

drop policy if exists "profiles_select_own_or_family" on public.profiles;
create policy "profiles_select_own_or_family"
on public.profiles
for select
using (
  auth.uid() = id
  or family_id in (
    select p.family_id from public.profiles p where p.id = auth.uid()
  )
);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "families_insert_authenticated" on public.families;
create policy "families_insert_authenticated"
on public.families
for insert
with check (auth.uid() is not null);

drop policy if exists "families_select_member" on public.families;
create policy "families_select_member"
on public.families
for select
using (
  id in (select p.family_id from public.profiles p where p.id = auth.uid())
);

drop policy if exists "sessions_select_family" on public.pump_sessions;
create policy "sessions_select_family"
on public.pump_sessions
for select
using (
  family_id in (select p.family_id from public.profiles p where p.id = auth.uid())
);

drop policy if exists "sessions_write_family" on public.pump_sessions;
create policy "sessions_write_family"
on public.pump_sessions
for all
using (
  family_id in (select p.family_id from public.profiles p where p.id = auth.uid())
)
with check (
  family_id in (select p.family_id from public.profiles p where p.id = auth.uid())
);

drop policy if exists "reminder_select_family" on public.reminder_settings;
create policy "reminder_select_family"
on public.reminder_settings
for select
using (
  user_id in (
    select p.id from public.profiles p
    where p.family_id in (select p2.family_id from public.profiles p2 where p2.id = auth.uid())
  )
);

drop policy if exists "reminder_write_own" on public.reminder_settings;
create policy "reminder_write_own"
on public.reminder_settings
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "invites_select_authenticated" on public.family_invites;
create policy "invites_select_authenticated"
on public.family_invites
for select
using (auth.uid() is not null);

drop policy if exists "invites_insert_member" on public.family_invites;
create policy "invites_insert_member"
on public.family_invites
for insert
with check (
  family_id in (select p.family_id from public.profiles p where p.id = auth.uid())
  and created_by = auth.uid()
);
