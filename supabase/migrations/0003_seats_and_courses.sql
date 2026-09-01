-- Comandas por comensal y por tiempo.
--
-- seat_number vive en order_items y no en una tabla aparte de comensales: un
-- comensal no tiene datos propios ni existe fuera del pedido, y separarlo
-- obligaría a un JOIN extra justo en la pantalla que más se refresca (cocina).
-- NULL significa "para la mesa" (algo para compartir).
--
-- course usa valores fijos para poder ordenar los tiempos; hacerlo
-- configurable por restaurante sería complejidad que este MVP no necesita.
-- El default 'fuerte' mantiene válidas las comandas que ya existen.

alter table order_items
  add column if not exists seat_number int
    check (seat_number is null or (seat_number >= 1 and seat_number <= 50)),
  add column if not exists course text not null default 'fuerte'
    check (course in ('bebida', 'entrada', 'fuerte', 'postre'));

-- Cuántos comensales hay en la mesa. Le sirve a la cocina para saber si la
-- comanda está completa antes de empezar a servir.
alter table orders
  add column if not exists diners int
    check (diners is null or (diners >= 1 and diners <= 50));

-- La cocina siempre lee los platillos de una comanda agrupados por tiempo.
create index if not exists order_items_order_course_idx
  on order_items (order_id, course);
