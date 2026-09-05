import { supabase } from "./supabaseClient";

/**
 * Cierra TODAS las comandas abiertas de una mesa.
 *
 * Se cierra por mesa y no por comanda porque una mesa suele pedir varias
 * rondas: cerrar solo una dejaría la cuenta a medias y el teléfono del cliente
 * nunca pasaría a la pantalla de agradecimiento, que espera a que no quede
 * ninguna abierta.
 */
export async function closeTableAccount(tableId: string): Promise<void> {
  const { error } = await supabase
    .from("orders")
    .update({ bill_status: "pagada", closed_at: new Date().toISOString() })
    .eq("table_id", tableId)
    .neq("bill_status", "pagada");
  if (error) throw error;
}

/**
 * Cierra una comanda suelta: pedidos a domicilio, o de una mesa que ya se
 * eliminó y por eso quedó sin table_id.
 */
export async function closeSingleOrder(orderId: string): Promise<void> {
  const { error } = await supabase
    .from("orders")
    .update({ bill_status: "pagada", closed_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) throw error;
}
