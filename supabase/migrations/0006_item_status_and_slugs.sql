-- Estado por ítem: barra y cocina trabajan en paralelo.
--
-- Antes el estado vivía solo en el pedido, así que la primera estación que
-- marcara "entregado" lo cerraba para la otra: la barra servía las bebidas y
-- las hamburguesas desaparecían de cocina todavía en la plancha.

alter table order_items
  add column if not exists status text not null default 'pendiente'
    check (status in ('pendiente', 'entregado', 'cancelado'));

-- Los pedidos que ya existen heredan su estado a cada ítem.
update order_items oi
set status = o.status
from orders o
where o.id = oi.order_id and oi.status is distinct from o.status;

create index if not exists order_items_order_status_idx
  on order_items (order_id, status);

-- ---------------------------------------------------------------------------
-- El pedido refleja a sus ítems
-- ---------------------------------------------------------------------------
-- orders.status se mantiene como el resumen del pedido, por dos razones: la
-- pantalla de cocina se suscribe a cambios de "orders" en tiempo real (si solo
-- se tocaran los ítems, ninguna pantalla se enteraría), y el resto de la app ya
-- lo consulta.
--
-- SECURITY DEFINER es imprescindible: el comensal es anónimo y no tiene permiso
-- para actualizar "orders". Sin esto, insertar los ítems de un pedido nuevo
-- dispararía el trigger, RLS lo rechazaría y el pedido entero fallaría.

create or replace function sync_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
  total int;
  pendientes int;
  cancelados int;
  nuevo text;
begin
  target := coalesce(new.order_id, old.order_id);

  select count(*),
         count(*) filter (where status = 'pendiente'),
         count(*) filter (where status = 'cancelado')
    into total, pendientes, cancelados
  from order_items
  where order_id = target;

  if total = 0 then
    return null;
  end if;

  nuevo := case
    when pendientes > 0 then 'pendiente'
    when cancelados = total then 'cancelado'
    else 'entregado'
  end;

  update orders set status = nuevo
  where id = target and status is distinct from nuevo;

  return null;
end;
$$;

drop trigger if exists order_items_status_sync on order_items;
create trigger order_items_status_sync
after insert or delete or update of status on order_items
for each row execute function sync_order_status();

-- ---------------------------------------------------------------------------
-- Slugs limpios antes de publicar las URLs de delivery
-- ---------------------------------------------------------------------------
-- Había "ARDE" en mayúsculas y "-garden" con guion inicial. Hoy el slug no se
-- usa en ninguna URL, así que cambiarlo no rompe nada; después de publicar
-- /delivery/:slug ya no se podría sin invalidar enlaces impresos.

update restaurants
set slug = trim(both '-' from regexp_replace(lower(slug), '[^a-z0-9]+', '-', 'g'))
where slug is distinct from trim(both '-' from regexp_replace(lower(slug), '[^a-z0-9]+', '-', 'g'));
