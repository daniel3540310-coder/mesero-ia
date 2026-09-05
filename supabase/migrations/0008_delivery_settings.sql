-- Configuración del servicio a domicilio.

-- courier_phone se llamaba así desde la migración 0005. Se renombra en vez de
-- crear una columna nueva: dos campos para el mismo teléfono acabarían
-- desincronizados y nadie sabría cuál manda.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'restaurants' and column_name = 'courier_phone'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'restaurants' and column_name = 'delivery_phone'
  ) then
    alter table restaurants rename column courier_phone to delivery_phone;
  end if;
end $$;

alter table restaurants
  add column if not exists delivery_phone text;

-- Se activa por defecto, también en los restaurantes que ya existen: quien no
-- quiera domicilio lo apaga desde su panel, pero nadie se queda con el enlace
-- roto sin saber por qué.
alter table restaurants
  add column if not exists delivery_enabled boolean not null default true;
