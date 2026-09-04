import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../contexts/AuthContext";
import type { Category, Order, OrderItem, Product, Station } from "../../types/database";
import { STATION_LABELS } from "../../types/database";

type Range = "hoy" | "semana" | "mes";

const RANGE_LABELS: Record<Range, string> = {
  hoy: "Hoy",
  semana: "Esta semana",
  mes: "Este mes",
};

/** Desde cuándo contar. La semana arranca en lunes, como la operación real. */
function rangeStart(range: Range): Date {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  if (range === "semana") {
    const weekday = (from.getDay() + 6) % 7; // lunes = 0
    from.setDate(from.getDate() - weekday);
  } else if (range === "mes") {
    from.setDate(1);
  }
  return from;
}

interface SoldItem {
  name: string;
  station: Station;
  quantity: number;
  revenue: number;
}

export function ReportsPage() {
  const { restaurant } = useAuth();
  const [range, setRange] = useState<Range>("hoy");
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!restaurant) return;
      setLoading(true);

      const { data: rawOrders } = await supabase
        .from("orders")
        .select("*")
        .eq("restaurant_id", restaurant.id)
        .gte("created_at", rangeStart(range).toISOString())
        // Una comanda cancelada no es una venta.
        .neq("status", "cancelado")
        .order("created_at", { ascending: false });

      const list = (rawOrders as Order[]) ?? [];
      setOrders(list);

      const [{ data: prods }, { data: cats }] = await Promise.all([
        supabase.from("products").select("*").eq("restaurant_id", restaurant.id),
        supabase.from("categories").select("*").eq("restaurant_id", restaurant.id),
      ]);
      setProducts((prods as Product[]) ?? []);
      setCategories((cats as Category[]) ?? []);

      if (list.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      const { data: rawItems } = await supabase
        .from("order_items")
        .select("*")
        .in("order_id", list.map((o) => o.id));
      setItems(((rawItems as OrderItem[]) ?? []).filter((i) => i.status !== "cancelado"));
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id, range]);

  const stats = useMemo(() => {
    const productById = new Map(products.map((p) => [p.id, p]));
    const stationByCategory = new Map(categories.map((c) => [c.id, c.station]));
    const orderById = new Map(orders.map((o) => [o.id, o]));

    const sold = new Map<string, SoldItem>();
    let total = 0;
    const byChannel = { mesa: 0, delivery: 0 };
    const byStation: Record<Station, number> = { kitchen: 0, bar: 0 };

    for (const item of items) {
      const product = productById.get(item.product_id);
      if (!product) continue;
      const revenue = product.price * item.quantity;
      const station: Station =
        product.station ?? stationByCategory.get(product.category_id) ?? "kitchen";

      total += revenue;
      byStation[station] += revenue;

      const order = orderById.get(item.order_id);
      if (order) byChannel[order.order_type] += revenue;

      const current = sold.get(product.id);
      sold.set(product.id, {
        name: product.name,
        station,
        quantity: (current?.quantity ?? 0) + item.quantity,
        revenue: (current?.revenue ?? 0) + revenue,
      });
    }

    const ranked = [...sold.values()].sort((a, b) => b.quantity - a.quantity);

    return {
      total,
      orders: orders.length,
      // El ticket promedio se mide por comanda, no por platillo.
      average: orders.length > 0 ? total / orders.length : 0,
      byChannel,
      byStation,
      top: ranked.slice(0, 5),
      topDish: ranked.find((i) => i.station === "kitchen") ?? null,
      topDrink: ranked.find((i) => i.station === "bar") ?? null,
    };
  }, [items, products, categories, orders]);

  if (!restaurant) return null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Reportes</h2>
        <div className="flex rounded-lg border border-neutral-300 p-0.5">
          {(Object.keys(RANGE_LABELS) as Range[]).map((value) => (
            <button
              key={value}
              onClick={() => setRange(value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                range === value
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {RANGE_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-neutral-500">Calculando…</p>
      ) : stats.orders === 0 ? (
        <p className="text-neutral-500">No hay ventas en este periodo.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Ventas" value={`$${stats.total.toFixed(2)}`} />
            <Metric label="Comandas" value={String(stats.orders)} />
            <Metric label="Ticket promedio" value={`$${stats.average.toFixed(2)}`} />
            <Metric
              label="Platillos vendidos"
              value={String(stats.top.reduce((s, i) => s + i.quantity, 0))}
              hint="entre los más vendidos"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card title="Estrellas">
              <Star label="Platillo" item={stats.topDish} />
              <Star label="Bebida" item={stats.topDrink} />
            </Card>

            <Card title="Por canal">
              <Split label="Mesa" amount={stats.byChannel.mesa} total={stats.total} />
              <Split label="Domicilio" amount={stats.byChannel.delivery} total={stats.total} />
            </Card>

            <Card title="Por estación">
              <Split
                label={STATION_LABELS.kitchen}
                amount={stats.byStation.kitchen}
                total={stats.total}
              />
              <Split label={STATION_LABELS.bar} amount={stats.byStation.bar} total={stats.total} />
            </Card>

            <Card title="Más vendidos">
              {stats.top.length === 0 ? (
                <p className="text-sm text-neutral-500">Sin datos.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {stats.top.map((item) => (
                    <li key={item.name} className="flex justify-between gap-2">
                      <span className="truncate">
                        {item.quantity}x {item.name}
                      </span>
                      <span className="whitespace-nowrap text-neutral-500">
                        ${item.revenue.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="text-[11px] text-neutral-400">{hint}</p>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Star({ label, item }: { label: string; item: SoldItem | null }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-neutral-500">{label}</span>
      {item ? (
        <span className="text-right font-medium">
          {item.name} <span className="text-neutral-400">({item.quantity})</span>
        </span>
      ) : (
        <span className="text-neutral-400">Sin ventas</span>
      )}
    </div>
  );
}

function Split({ label, amount, total }: { label: string; amount: number; total: number }) {
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-neutral-600">{label}</span>
        <span className="font-medium">
          ${amount.toFixed(2)} <span className="text-neutral-400">({pct}%)</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
