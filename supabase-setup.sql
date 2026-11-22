-- ============================================================================
-- VN crochet — One-Click Supabase Database Setup
-- Paste this entire file into: Supabase Dashboard -> SQL Editor -> New query
-- Then click "Run". Safe to run more than once.
-- ============================================================================

-- 1. Store catalog + shop appearance settings (single 'main' row)
create table if not exists public.store_state (
  id text primary key,
  products jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2. Customer orders submitted from Checkout
create table if not exists public.orders (
  id text primary key,
  name text not null,
  phone text not null,
  email text not null default '',
  city text not null default '',
  notes text not null default '',
  items jsonb not null default '[]'::jsonb,
  subtotal integer not null default 0,
  shipping integer not null default 0,
  total integer not null default 0,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Enable Row Level Security (protects your admin writes & customer orders)
alter table public.store_state enable row level security;
alter table public.orders enable row level security;

-- 4. Store policies: everyone can view the shop; ONLY signed-in admin can edit
drop policy if exists "Public can read store_state" on public.store_state;
create policy "Public can read store_state"
  on public.store_state for select
  using (true);

drop policy if exists "Admin can insert store_state" on public.store_state;
create policy "Admin can insert store_state"
  on public.store_state for insert
  to authenticated
  with check (true);

drop policy if exists "Admin can update store_state" on public.store_state;
create policy "Admin can update store_state"
  on public.store_state for update
  to authenticated
  using (true)
  with check (true);

-- 5. Order policies: shoppers can place orders; ONLY signed-in admin can view/update them
drop policy if exists "Public can place orders" on public.orders;
create policy "Public can place orders"
  on public.orders for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Admin can read orders" on public.orders;
create policy "Admin can read orders"
  on public.orders for select
  to authenticated
  using (true);

drop policy if exists "Admin can update orders" on public.orders;
create policy "Admin can update orders"
  on public.orders for update
  to authenticated
  using (true)
  with check (true);
