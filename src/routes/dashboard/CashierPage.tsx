import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../contexts/AuthContext";
import { closeSingleOrder, closeTableAccount } from "../../lib/billing";
import { buildCourierMessage, navigationUrl, normalizePhone, whatsappUrl } from "../../lib/courierDispatch";
import type { Order, OrderItem, Product, RestaurantTable } from "../../types/database";
import { PAYMENT_LABELS } from "../../types/database";

type ViewOrder = Order & { items: (OrderItem & { product: Product | null })[] };

/** En qué punto de la visita está una mesa. */
type TableState = "libre" | "ocupada" | "servida" | "cuenta";

const TABLE_STATE: Record<TableState, { label: string; className: string }> = {
  libre: { label: "Libre", className: "bg-neutral-100 text-neutral-500" },
  ocupada: { label: "Ocupada", className: "bg-amber-100 text-amber-800" },
  servida: { label: "Comida servida", className: "bg-blue-100 text-blue-800" },
  cuenta: { label: "Cuenta pedida", className: "bg-green-100 text-green-800" },
};

function orderTotal(order: ViewOrder): number {
  return order.items
    .filter((i) => i.status !== "cancelado")
    .reduce((sum, i) => sum + (i.product?.price ?? 0) * i.quantity, 0);
}

/**
 * Caja / Control de cuentas.
 *
 * Es una pantalla de monitoreo, no un punto de venta: no cobra, no calcula
 * cambio ni maneja dinero. Solo dice qué mesa necesita atención, qué pedido
 * hay que despachar y cuándo una mesa quedó libre.
 */
export function CashierPage() {
  const { restaurant } = useAuth();
  const [orders, setOrders] = useState<ViewOrder[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!restaurant) return;

    // Solo lo que sigue vivo: las comandas ya cerradas pertenecen al historial,
    // que se consulta en Reportes.
    const [{ data: rawOrders }, { data: rawTables }, { data: rawProducts }] = await Promise.all([
      supabase
        .from("orders")
        .select("*")
        .eq("restaurant_id", restaurant.id)
        .neq("bill_status", "pagada")
        .neq("status", "cancelado")
        .order("created_at", { ascending: true }),
      supabase.from("tables").select("*").eq("restaurant_id", restaurant.id).order("label"),
      supabase.from("products").select("*").eq("restaurant_id", restaurant.id),
    ]);

    const list = (rawOrders as Order[]) ?? [];
    const productsById = new Map(((rawProducts as Product[]) ?? []).map((p) => [p.id, p]));

    let items: OrderItem[] = [];
    if (list.length > 0) {
      const { data: rawItems } = await supabase
        .from("order_items")
        .select("*")
        .in("order_id", list.map((o) => o.id));
      items = (rawItems as OrderItem[]) ?? [];
    }

    setOrders(
      list.map((order) => ({
        ...order,
        items: items
          .filter((i) => i.order_id === order.id)
          .map((i) => ({ ...i, product: productsById.get(i.product_id) ?? null })),
      }))
    );
    setTables((rawTables as RestaurantTable[]) ?? []);
    setLoading(false);
  }, [restaurant]);

  useEffect(() => {
    load();
    if (!restaurant) return;
    const channel = supabase
      .channel(`cashier-${restaurant.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurant.id}` },
        () => load()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurant, load]);

  /** Las comandas abiertas agrupadas por mesa: una mesa pide varias rondas. */
  const byTable = useMemo(() => {
    const map = new Map<string, ViewOrder[]>();
    for (const order of orders) {
      if (order.order_type !== "mesa" || !order.table_id) continue;
      map.set(order.table_id, [...(map.get(order.table_id) ?? []), order]);
    }
    return map;
  }, [orders]);

  const billRequests = useMemo(
    () =>
      tables
        .map((table) => ({ table, orders: byTable.get(table.id) ?? [] }))
        .filter((row) => row.orders.some((o) => o.bill_status === "solicitada")),
    [tables, byTable]
  );

  const deliveries = useMemo(
    () => orders.filter((o) => o.order_type === "delivery"),
    [orders]
  );

  /** Comandas de mesas que el restaurante eliminó: se cierran una por una. */
  const orphans = useMemo(
    () => orders.filter((o) => o.order_type === "mesa" && !o.table_id),
    [orders]
  );

  function stateOf(tableId: string): TableState {
    const open = byTable.get(tableId) ?? [];
    if (open.length === 0) return "libre";
    if (open.some((o) => o.bill_status === "solicitada")) return "cuenta";
    const items = open.flatMap((o) => o.items);
    if (items.length > 0 && items.every((i) => i.status !== "pendiente")) return "servida";
    return "ocupada";
  }

  async function releaseTable(tableId: string) {
    setBusy(tableId);
    try {
      await closeTableAccount(tableId);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function closeOrder(orderId: string) {
    setBusy(orderId);
    try {
      await closeSingleOrder(orderId);
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (!restaurant) return null;
  const restaurantName = restaurant.name;
  const deliveryPhone = restaurant.delivery_phone;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Caja / Control de cuentas</h2>
        <p className="text-sm text-neutral-500">
          Monitoreo de la operación. Mesero IA no cobra ni maneja dinero: aquí solo se ve
          quién necesita atención y se libera la mesa cuando terminó.
        </p>
      </div>

      {loading ? (
        <p className="text-neutral-500">Cargando…</p>
      ) : (
        <>
          {/* 1. Cuentas solicitadas */}
          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Cuentas solicitadas ({billRequests.length})
            </h3>
            {billRequests.length === 0 ? (
              <p className="text-sm text-neutral-500">Ninguna mesa ha pedido la cuenta.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {billRequests.map(({ table, orders: tableOrders }) => {
                  const method = tableOrders.find((o) => o.payment_method)?.payment_method ?? null;
                  const total = tableOrders.reduce((sum, o) => sum + orderTotal(o), 0);
                  return (
                    <div
                      key={table.id}
                      className="rounded-xl border-2 border-green-300 bg-green-50 p-4"
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <p className="font-semibold">{table.label}</p>
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium">
                          {method ? PAYMENT_LABELS[method] : "Sin especificar"}
                        </span>
                      </div>
                      <p className="mb-1 text-sm text-neutral-600">
                        {tableOrders.length} {tableOrders.length === 1 ? "comanda" : "comandas"} ·{" "}
                        <span className="font-medium">${total.toFixed(2)}</span>
                      </p>
                      <p className="mb-3 text-xs text-neutral-500">
                        {method === "tarjeta"
                          ? "Lleva la terminal a la mesa."
                          : method === "efectivo"
                            ? "Va a pagar en efectivo."
                            : "El cliente no indicó forma de pago."}
                      </p>
                      <button
                        onClick={() => releaseTable(table.id)}
                        disabled={busy === table.id}
                        className="w-full rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                      >
                        {busy === table.id ? "Cerrando…" : "Cerrar orden y liberar mesa"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 2. Despacho a domicilio */}
          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Despacho a domicilio ({deliveries.length})
            </h3>
            {deliveries.length === 0 ? (
              <p className="text-sm text-neutral-500">Sin pedidos a domicilio pendientes.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {deliveries.map((order) => {
                  const ready = order.items.every((i) => i.status !== "pendiente");
                  return (
                    <div key={order.id} className="rounded-xl border border-neutral-200 bg-white p-4">
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <p className="font-semibold">🛵 {order.customer_name ?? "Domicilio"}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            ready ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {ready ? "Listo para salir" : "En preparación"}
                        </span>
                      </div>
                      {order.customer_address && (
                        <p className="mb-1 text-xs text-neutral-600">{order.customer_address}</p>
                      )}
                      <ul className="mb-2 text-xs text-neutral-600">
                        {order.items.map((i) => (
                          <li key={i.id}>
                            {i.quantity}x {i.product?.name ?? "Producto"}
                          </li>
                        ))}
                      </ul>
                      <p className="mb-3 text-sm font-medium">${orderTotal(order).toFixed(2)}</p>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <a
                          href={whatsappUrl(
                            buildCourierMessage(order, order.items, restaurantName),
                            deliveryPhone
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg bg-green-600 px-3 py-1.5 font-medium text-white hover:bg-green-700"
                        >
                          Enviar al repartidor
                        </a>
                        {normalizePhone(order.customer_phone) && (
                          <a
                            href={`tel:${normalizePhone(order.customer_phone)}`}
                            className="rounded-lg border border-neutral-300 px-3 py-1.5 font-medium hover:bg-neutral-100"
                          >
                            Llamar
                          </a>
                        )}
                        {navigationUrl(order) && (
                          <a
                            href={navigationUrl(order)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-neutral-300 px-3 py-1.5 font-medium hover:bg-neutral-100"
                          >
                            Ver ruta
                          </a>
                        )}
                        <button
                          onClick={() => closeOrder(order.id)}
                          disabled={busy === order.id}
                          className="rounded-lg border border-neutral-300 px-3 py-1.5 font-medium hover:bg-neutral-100 disabled:opacity-60"
                        >
                          {busy === order.id ? "Cerrando…" : "Marcar entregado"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 3. Estado de mesas */}
          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Estado de mesas
            </h3>
            {tables.length === 0 ? (
              <p className="text-sm text-neutral-500">Aún no has creado mesas.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {tables.map((table) => {
                  const state = stateOf(table.id);
                  const open = byTable.get(table.id) ?? [];
                  const total = open.reduce((sum, o) => sum + orderTotal(o), 0);
                  return (
                    <div key={table.id} className="rounded-xl border border-neutral-200 bg-white p-3">
                      <p className="truncate font-medium">{table.label}</p>
                      <span
                        className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TABLE_STATE[state].className}`}
                      >
                        {TABLE_STATE[state].label}
                      </span>
                      {open.length > 0 && (
                        <p className="mt-1 text-xs text-neutral-500">${total.toFixed(2)}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Comandas cuya mesa se eliminó: no se pueden liberar por mesa. */}
          {orphans.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Comandas sin mesa ({orphans.length})
              </h3>
              <p className="mb-2 text-xs text-neutral-500">
                Su mesa fue eliminada, pero la venta se conserva. Ciérralas para sacarlas de aquí.
              </p>
              <div className="space-y-2">
                {orphans.map((order) => (
                  <div
                    key={order.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-sm"
                  >
                    <span>
                      {order.table_label ?? "Mesa eliminada"} · ${orderTotal(order).toFixed(2)}
                    </span>
                    <button
                      onClick={() => closeOrder(order.id)}
                      disabled={busy === order.id}
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-100 disabled:opacity-60"
                    >
                      {busy === order.id ? "Cerrando…" : "Cerrar"}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
