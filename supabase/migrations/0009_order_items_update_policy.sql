-- El restaurante no podía marcar sus platillos como entregados.
--
-- La migración 0006 movió el estado de "orders" a "order_items" para que barra
-- y cocina cerraran por separado, pero order_items solo tenía políticas de
-- INSERT y SELECT. Sin política de UPDATE, RLS rechazaba el cambio en
-- silencio: PostgREST devuelve éxito con cero filas afectadas, así que ni el
-- botón ni los comandos de voz mostraban error, simplemente no hacían nada.
--
-- Mismo criterio que "owner updates own orders": solo el dueño del restaurante
-- al que pertenece la comanda. El comensal sigue sin poder tocar el estado de
-- los platillos; para pedir la cuenta tiene su propia función acotada.

create policy "owner updates own order_items" on order_items
  for update
  using (
    exists (
      select 1 from orders o
      where o.id = order_id and owns_restaurant(o.restaurant_id)
    )
  )
  with check (
    exists (
      select 1 from orders o
      where o.id = order_id and owns_restaurant(o.restaurant_id)
    )
  );
