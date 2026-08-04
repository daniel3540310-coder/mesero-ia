import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../contexts/AuthContext";
import type {
  Order,
  OrderItem,
  OrderStatus,
  Product,
  RestaurantTable,
} from "../../types/database";

interface OrderView extends Order {
  table: RestaurantTable | null;
  items: (OrderItem & { product: Product | null })[];
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente: "Pendiente",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  entregado: "bg-green-100 text-green-700",
  cancelado: "bg-neutral-200 text-neutral-600",
};

export function OrdersPage() {
  const { restaurant } = useAuth();
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!restaurant) return;
    setLoading(true);
    const { data: rawOrders } = await supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: false });

    const ordersList = (rawOrders as Order[]) ?? [];
    const [{ data: tables }, { data: items }, { data: products }] = await Promise.all([
      supabase.from("tables").select("*").eq("restaurant_id", restaurant.id),
      supabase
        .from("order_items")
        .select("*")
        .in("order_id", ordersList.map((o) => o.id).length ? ordersList.map((o) => o.id) : [""]),
      supabase.from("products").select("*").eq("restaurant_id", restaurant.id),
    ]);

    const tablesById = new Map((tables as RestaurantTable[] | null)?.map((t) => [t.id, t]));
    const productsById = new Map((products as Product[] | null)?.map((p) => [p.id, p]));

    const view: OrderView[] = ordersList.map((order) => ({
      ...order,
      table: tablesById.get(order.table_id) ?? null,
      items: ((items as OrderItem[] | null) ?? [])
        .filter((i) => i.order_id === order.id)
        .map((i) => ({ ...i, product: productsById.get(i.product_id) ?? null })),
    }));

    setOrders(view);
    setLoading(false);
  }

  useEffect(() => {
    load();
    if (!restaurant) return;
    const channel = supabase
      .channel(`orders-${restaurant.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurant.id}` },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id]);

  async function updateStatus(orderId: string, status: OrderStatus) {
    await supabase.from("orders").update({ status }).eq("id", orderId);
    await load();
  }

  if (!restaurant) return null;

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">Pedidos</h2>
      {loading ? (
        <p className="text-neutral-500">Cargando…</p>
      ) : orders.length === 0 ? (
        <p className="text-neutral-500">Aún no hay pedidos.</p>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="font-medium">{order.table?.label ?? "Mesa desconocida"}</p>
                  <p className="text-xs text-neutral-400">
                    {new Date(order.created_at).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status]}`}
                >
                  {STATUS_LABELS[order.status]}
                </span>
              </div>
              <ul className="mb-3 space-y-1 text-sm">
                {order.items.map((item) => (
                  <li key={item.id}>
                    {item.quantity}x {item.product?.name ?? "Producto eliminado"}
                    {item.removed_ingredients.length > 0 && (
                      <span className="text-neutral-500">
                        {" "}
                        (sin {item.removed_ingredients.join(", ")})
                      </span>
                    )}
                    {item.notes && <span className="text-neutral-500"> — {item.notes}</span>}
                  </li>
                ))}
              </ul>
              {order.status === "pendiente" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => updateStatus(order.id, "entregado")}
                    className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                  >
                    Marcar entregado
                  </button>
                  <button
                    onClick={() => updateStatus(order.id, "cancelado")}
                    className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-100"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
