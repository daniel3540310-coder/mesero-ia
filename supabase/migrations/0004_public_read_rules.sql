-- El motor conversacional pasa a ejecutarse en el navegador del cliente, así
-- que necesita leer las reglas del restaurante igual que ya lee el menú.
--
-- Antes solo la Edge Function podía verlas, porque usaba la service role key.
-- No hay pérdida de privacidad: son exactamente los textos que el restaurante
-- escribió para que se le cuenten al comensal (políticas, horarios, platillos
-- estrella, preguntas frecuentes). Se limita a restaurantes activos, igual que
-- el resto de lecturas públicas.

create policy "public read policies of active restaurants" on policies
  for select using (restaurant_is_active(restaurant_id));

create policy "public read ai_knowledge of active restaurants" on ai_knowledge
  for select using (restaurant_is_active(restaurant_id));
