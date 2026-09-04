-- Estaciones (cocina / barra) y pedidos a domicilio.

-- ---------------------------------------------------------------------------
-- 1. Estación de cada platillo
-- ---------------------------------------------------------------------------
-- La estación vive en la CATEGORÍA, que es como el restaurante ya organiza su
-- carta ("BEBIDAS" es de barra, "MAIN COURSES" de cocina). El producto solo
-- lleva una excepción opcional, para el caso raro del postre que prepara la
-- barra o el café que sale de cocina. Así el restaurante no tiene que
-- clasificar 30 productos uno por uno.

alter table categories
  add column if not exists station text not null default 'kitchen'
    check (station in ('kitchen', 'bar'));

alter table products
  add column if not exists station text
    check (station is null or station in ('kitchen', 'bar'));

-- Clasificación inicial con las mismas palabras clave que ya usa el motor para
-- deducir el tiempo "bebida", en español y en inglés porque los menús reales
-- están en ambos idiomas.
update categories
set station = 'bar'
where station = 'kitchen'
  and lower(name) ~ '(bebida|refresco|coctel|cóctel|cocktail|mocktail|cerveza|beer|vino|wine|jugo|juice|cafe|café|coffee|licor|trago|agua|water|smoothie|drink|bar|agave|mezcal|tequila|burbuja|champagne|soda|mixolog|mezcalita|margarita)';

-- ---------------------------------------------------------------------------
-- 2. Pedidos a domicilio
-- ---------------------------------------------------------------------------
-- Un pedido de delivery no tiene mesa, así que table_id deja de ser
-- obligatorio. La integridad se mantiene con un CHECK: cada tipo de pedido
-- exige sus propios datos, y así no puede colarse un delivery sin teléfono ni
-- un pedido de mesa sin mesa.

alter table orders alter column table_id drop not null;

alter table orders
  add column if not exists order_type text not null default 'mesa'
    check (order_type in ('mesa', 'delivery')),
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists customer_address text,
  -- Coordenadas del navegador del cliente; alimentan el enlace de navegación
  -- que recibe el repartidor.
  add column if not exists customer_lat double precision,
  add column if not exists customer_lng double precision;

alter table orders drop constraint if exists orders_type_requirements;
alter table orders add constraint orders_type_requirements check (
  (order_type = 'mesa' and table_id is not null)
  or (order_type = 'delivery' and customer_name is not null and customer_phone is not null)
);

-- La pantalla de cocina y la de delivery filtran por restaurante y tipo.
create index if not exists orders_restaurant_type_idx
  on orders (restaurant_id, order_type, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Repartidor
-- ---------------------------------------------------------------------------
-- Teléfono al que se manda el pedido por WhatsApp. Si está vacío, el botón
-- abre el selector de contactos en vez de un chat concreto.
alter table restaurants
  add column if not exists courier_phone text;

-- El slug pasa a ser parte de una URL pública (/delivery/:slug), así que dos
-- restaurantes no pueden compartirlo ni diferenciarse solo por mayúsculas.
create unique index if not exists restaurants_slug_lower_idx
  on restaurants (lower(slug));
