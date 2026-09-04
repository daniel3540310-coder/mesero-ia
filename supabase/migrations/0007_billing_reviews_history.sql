-- Cierre de mesa, cobro, reseñas e historial que sobrevive.

-- ---------------------------------------------------------------------------
-- 1. El historial deja de borrarse
-- ---------------------------------------------------------------------------
-- table_id tenía ON DELETE CASCADE: al borrar una mesa desaparecían sus
-- pedidos, y con ellos las ventas de ese día. Ya hubo restaurantes recreando
-- mesas y perdiendo historial sin enterarse.
--
-- Antes de soltar la mesa hay que guardar su nombre: un pedido histórico con
-- table_id NULL no diría de qué mesa fue. Y el CHECK que exigía table_id en los
-- pedidos de mesa tiene que ceder, o el propio DELETE fallaría al dejarlo NULL.

alter table orders add column if not exists table_label text;

update orders o
set table_label = t.label
from tables t
where t.id = o.table_id and o.table_label is null;

alter table orders drop constraint if exists orders_table_id_fkey;
alter table orders
  add constraint orders_table_id_fkey
  foreign key (table_id) references tables(id) on delete set null;

alter table orders drop constraint if exists orders_type_requirements;
alter table orders add constraint orders_type_requirements check (
  order_type = 'mesa'
  or (order_type = 'delivery' and customer_name is not null and customer_phone is not null)
);

-- ---------------------------------------------------------------------------
-- 2. Cobro
-- ---------------------------------------------------------------------------
-- El cobro va aparte del estado de preparación: un pedido puede estar entregado
-- y sin pagar, o pedido-de-cuenta con platillos aún en la plancha. Además
-- status lo recalcula un trigger a partir de los platillos, así que meter
-- "pagado" ahí lo sobrescribiría.

alter table orders
  add column if not exists bill_status text not null default 'abierta'
    check (bill_status in ('abierta', 'solicitada', 'pagada')),
  add column if not exists payment_method text
    check (payment_method is null or payment_method in ('efectivo', 'tarjeta')),
  add column if not exists closed_at timestamptz;

create index if not exists orders_bill_status_idx
  on orders (restaurant_id, bill_status);

-- ---------------------------------------------------------------------------
-- 3. Reseñas
-- ---------------------------------------------------------------------------
alter table restaurants
  add column if not exists google_review_url text;

-- ---------------------------------------------------------------------------
-- 4. El comensal puede ver su propia cuenta
-- ---------------------------------------------------------------------------
-- Hasta ahora solo el restaurante podía leer pedidos, así que el cliente no
-- tenía forma de ver lo que llevaba consumido.
--
-- Se abre SOLO a los pedidos de mesa: las filas de domicilio llevan nombre,
-- teléfono y dirección del cliente, y RLS filtra por fila, no por columna. Un
-- pedido de mesa no contiene datos personales, y quien conoce el QR de la mesa
-- ya está sentado en ella.

create policy "public read table orders" on orders
  for select using (order_type = 'mesa' and restaurant_is_active(restaurant_id));

create policy "public read table order_items" on order_items
  for select using (
    exists (
      select 1 from orders o
      where o.id = order_id
        and o.order_type = 'mesa'
        and restaurant_is_active(o.restaurant_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Pedir la cuenta
-- ---------------------------------------------------------------------------
-- Vía función y no con una política de UPDATE: RLS no distingue columnas, así
-- que dejar al comensal actualizar "orders" le permitiría también cancelar
-- platillos o darlos por entregados. Aquí solo puede hacer una cosa.

create or replace function request_bill(p_table_id uuid, p_method text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_method not in ('efectivo', 'tarjeta') then
    raise exception 'Método de pago inválido';
  end if;

  update orders
  set bill_status = 'solicitada',
      payment_method = p_method
  where table_id = p_table_id
    and bill_status = 'abierta'
    and status <> 'cancelado';
end;
$$;

grant execute on function request_bill(uuid, text) to anon, authenticated;
