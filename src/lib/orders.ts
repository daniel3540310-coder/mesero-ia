import { supabase } from "./supabaseClient";
import type { DraftLine } from "./orderEngine";

/** Datos del cliente que pide a domicilio. */
export interface DeliveryCustomer {
  name: string;
  phone: string;
  address: string;
  lat: number | null;
  lng: number | null;
}

interface SubmitInput {
  restaurantId: string;
  lines: DraftLine[];
  diners?: number | null;
  /** Mesa del QR; ausente en domicilio. */
  tableId?: string;
  customer?: DeliveryCustomer;
}

/**
 * Registra la comanda.
 *
 * El id se genera aquí y nunca se le pide la fila de vuelta a Supabase: el
 * cliente es anónimo y las políticas RLS solo dejan LEER pedidos al restaurante
 * dueño, así que un `.select()` tras el insert haría que PostgREST cancelara la
 * operación entera.
 */
export async function submitOrder({
  restaurantId,
  lines,
  diners,
  tableId,
  customer,
}: SubmitInput): Promise<void> {
  if (lines.length === 0) return;

  const orderId = crypto.randomUUID();

  const { error: orderError } = await supabase.from("orders").insert({
    id: orderId,
    restaurant_id: restaurantId,
    order_type: customer ? "delivery" : "mesa",
    table_id: tableId ?? null,
    status: "pendiente",
    diners: diners ?? maxSeat(lines),
    customer_name: customer?.name ?? null,
    customer_phone: customer?.phone ?? null,
    customer_address: customer?.address || null,
    customer_lat: customer?.lat ?? null,
    customer_lng: customer?.lng ?? null,
  });
  if (orderError) throw orderError;

  const { error: itemsError } = await supabase.from("order_items").insert(
    lines.map((line) => ({
      order_id: orderId,
      product_id: line.product.id,
      quantity: line.quantity,
      removed_ingredients: line.removedIngredients,
      notes: line.notes || null,
      seat_number: line.seat,
      course: line.course,
    }))
  );
  if (itemsError) throw itemsError;
}

/** Comensal más alto de la comanda: sirve para deducir cuántos son en la mesa. */
function maxSeat(lines: DraftLine[]): number | null {
  const seats = lines.map((l) => l.seat).filter((s): s is number => typeof s === "number");
  return seats.length > 0 ? Math.max(...seats) : null;
}
