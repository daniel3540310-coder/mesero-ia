-- El panel de Pedidos (OrdersPage) se suscribe a postgres_changes sobre
-- "orders" para actualizarse en vivo cuando llega un pedido nuevo desde el
-- carrito o desde el chat. Sin esto, el INSERT funciona pero el dashboard
-- del restaurante nunca recibe el evento y se queda con datos viejos hasta
-- que se recarga la página manualmente.
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table order_items;
