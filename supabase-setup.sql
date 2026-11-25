-- ============================================================================
-- VN crochet — Supabase Database Setup (with Razorpay Payment Tracking)
-- Paste into: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to run more than once.
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
  payment_status text not null default 'pending',
  razorpay_order_id text,
  razorpay_payment_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Safe migrations if orders table already exists
alter table public.orders add column if not exists payment_status text not null default 'pending';
alter table public.orders add column if not exists razorpay_order_id text;
alter table public.orders add column if not exists razorpay_payment_id text;
alter table public.orders add column if not exists paid_at timestamptz;
create index if not exists idx_orders_razorpay_order_id on public.orders (razorpay_order_id);

-- 3. Enable Row Level Security
alter table public.store_state enable row level security;
alter table public.orders enable row level security;

-- 4. Store policies: everyone can view the shop; ONLY signed-in admin can edit
-- IMPORTANT SECURITY STEP:
--   a) In Supabase -> Authentication -> Providers -> Email, turn OFF "Allow new users to sign up".
--   b) Replace 'YOUR_ADMIN_USER_UUID' below with your user ID from Authentication -> Users
--      to strictly lock writes to ONLY your account.
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

-- 5. Order policies:
--    Once SUPABASE_SERVICE_ROLE_KEY is set in Cloudflare Pages, orders are created and
--    verified strictly by your server (/api/create-order & /api/verify-payment), so we
--    remove public direct inserts to prevent fake orders or price tampering!
drop policy if exists "Public can place orders" on public.orders;

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
