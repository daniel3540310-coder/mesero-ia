import type { Order, OrderItem, Product } from "../types/database";

type DispatchItem = OrderItem & { product: Product | null };

/**
 * Enlace de navegación para el repartidor.
 *
 * Se usa la URL universal de Google Maps, que no requiere API key ni cuesta
 * nada: abre la app nativa en el teléfono y el navegador en escritorio.
 */
export function navigationUrl(order: Pick<Order, "customer_lat" | "customer_lng" | "customer_address">): string | null {
  if (order.customer_lat !== null && order.customer_lng !== null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${order.customer_lat},${order.customer_lng}`;
  }
  if (order.customer_address) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.customer_address)}`;
  }
  return null;
}

/** Solo dígitos: wa.me y tel: no aceptan espacios ni signos. */
export function normalizePhone(phone: string | null): string {
  return (phone ?? "").replace(/\D/g, "");
}

/**
 * Mensaje que recibe el repartidor.
 *
 * Se mantiene compacto a propósito: WhatsApp trunca los enlaces muy largos, y
 * una comanda grande los alcanza rápido. Por eso van solo los datos que el
 * repartidor necesita para salir, no el desglose completo del pedido.
 */
export function buildCourierMessage(
  order: Order,
  items: DispatchItem[],
  restaurantName: string
): string {
  const lines = items
    .filter((i) => i.status !== "cancelado")
    .map((i) => `• ${i.quantity}x ${i.product?.name ?? "Producto"}${i.notes ? ` (${i.notes})` : ""}`);

  const total = items
    .filter((i) => i.status !== "cancelado")
    .reduce((sum, i) => sum + (i.product?.price ?? 0) * i.quantity, 0);

  const maps = navigationUrl(order);
  const phone = normalizePhone(order.customer_phone);

  return [
    `*Pedido de ${restaurantName}*`,
    "",
    `Cliente: ${order.customer_name ?? "—"}`,
    phone ? `Teléfono: tel:${phone}` : null,
    order.customer_address ? `Dirección: ${order.customer_address}` : null,
    maps ? `Ruta: ${maps}` : null,
    "",
    ...lines,
    "",
    `Total: $${total.toFixed(2)}`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/**
 * Enlace de WhatsApp. Con teléfono del repartidor abre su chat directamente;
 * sin él, abre el selector de contactos para elegir a quién mandarlo.
 */
export function whatsappUrl(message: string, courierPhone: string | null): string {
  const to = normalizePhone(courierPhone);
  const text = encodeURIComponent(message);
  return to ? `https://wa.me/${to}?text=${text}` : `https://wa.me/?text=${text}`;
}
