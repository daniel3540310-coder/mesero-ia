-- Mesero IA — esquema inicial
create extension if not exists "pgcrypto";

create table restaurants (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  description text,
  phone text,
  address text,
  logo_url text,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  sort_order int not null default 0
);

create table products (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10, 2) not null,
  image_url text,
  prep_time_minutes int,
  is_available boolean not null default true
);

create table ingredients (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  name text not null,
  is_modifiable boolean not null default false,
  is_allergen boolean not null default false
);

create table policies (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  content text not null,
  sort_order int not null default 0
);

create table ai_knowledge (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  category text not null check (category in (
    'historia', 'platillo_estrella', 'promocion', 'horario',
    'faq', 'recomendacion', 'restriccion', 'info'
  )),
  title text not null,
  content text not null
);

create table tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  label text not null,
  qr_token uuid not null unique default gen_random_uuid()
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  table_id uuid not null references tables(id) on delete cascade,
  status text not null default 'pendiente' check (status in ('pendiente', 'entregado', 'cancelado')),
  created_at timestamptz not null default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity int not null default 1,
  removed_ingredients jsonb not null default '[]',
  notes text
);

-- Helper: restaurante dueño de la fila actual del usuario autenticado
create or replace function owns_restaurant(target_restaurant_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from restaurants
    where id = target_restaurant_id
    and auth_user_id = auth.uid()
  );
$$;

alter table restaurants enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table ingredients enable row level security;
alter table policies enable row level security;
alter table ai_knowledge enable row level security;
alter table tables enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

-- restaurants
create policy "public read active restaurants" on restaurants
  for select using (status = 'active');
create policy "owner reads own restaurant" on restaurants
  for select using (auth.uid() = auth_user_id);
create policy "owner updates own restaurant" on restaurants
  for update using (auth.uid() = auth_user_id);

-- helper: el restaurante dueño de la fila está activo (para lectura pública)
create or replace function restaurant_is_active(target_restaurant_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from restaurants
    where id = target_restaurant_id
    and status = 'active'
  );
$$;

-- categories
create policy "public read categories of active restaurants" on categories
  for select using (restaurant_is_active(restaurant_id));
create policy "owner manages categories" on categories
  for all using (owns_restaurant(restaurant_id)) with check (owns_restaurant(restaurant_id));

-- products
create policy "public read products of active restaurants" on products
  for select using (restaurant_is_active(restaurant_id));
create policy "owner manages products" on products
  for all using (owns_restaurant(restaurant_id)) with check (owns_restaurant(restaurant_id));

-- ingredients (visibilidad sigue al producto)
create policy "public read ingredients of active restaurants" on ingredients
  for select using (
    exists (select 1 from products p where p.id = product_id and restaurant_is_active(p.restaurant_id))
  );
create policy "owner manages ingredients" on ingredients
  for all using (
    exists (select 1 from products p where p.id = product_id and owns_restaurant(p.restaurant_id))
  ) with check (
    exists (select 1 from products p where p.id = product_id and owns_restaurant(p.restaurant_id))
  );

-- policies (no acceso público directo, la usa la Edge Function con service_role)
create policy "owner manages policies" on policies
  for all using (owns_restaurant(restaurant_id)) with check (owns_restaurant(restaurant_id));

-- ai_knowledge (sin acceso público directo)
create policy "owner manages ai_knowledge" on ai_knowledge
  for all using (owns_restaurant(restaurant_id)) with check (owns_restaurant(restaurant_id));

-- tables (el qr_token actúa como capability token, pero solo si el restaurante sigue activo)
create policy "public read tables of active restaurants" on tables
  for select using (restaurant_is_active(restaurant_id));
create policy "owner manages tables" on tables
  for all using (owns_restaurant(restaurant_id)) with check (owns_restaurant(restaurant_id));

-- orders
create policy "public creates orders" on orders
  for insert with check (true);
create policy "owner reads own orders" on orders
  for select using (owns_restaurant(restaurant_id));
create policy "owner updates own orders" on orders
  for update using (owns_restaurant(restaurant_id));

-- order_items
create policy "public creates order_items" on order_items
  for insert with check (true);
create policy "owner reads own order_items" on order_items
  for select using (
    exists (select 1 from orders o where o.id = order_id and owns_restaurant(o.restaurant_id))
  );

-- Storage: bucket de imágenes de menú
insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

create policy "public read menu images" on storage.objects
  for select using (bucket_id = 'menu-images');

create policy "owner uploads own menu images" on storage.objects
  for insert with check (
    bucket_id = 'menu-images'
    and (storage.foldername(name))[1] in (
      select id::text from restaurants where auth_user_id = auth.uid()
    )
  );

create policy "owner updates own menu images" on storage.objects
  for update using (
    bucket_id = 'menu-images'
    and (storage.foldername(name))[1] in (
      select id::text from restaurants where auth_user_id = auth.uid()
    )
  );
