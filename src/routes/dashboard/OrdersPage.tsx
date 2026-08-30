import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../contexts/AuthContext";
import { useKitchenAlert } from "../../hooks/useKitchenAlert";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import { hasWakeWord, parseKitchenCommand } from "../../lib/voiceCommands";
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

/** Minutos que se asumen cuando un producto no tiene tiempo de preparación configurado. */
const DEFAULT_PREP_MINUTES = 10;

/** Una comanda está lista cuando termina su platillo más lento, no el más rápido. */
function orderPrepMinutes(order: OrderView): number {
  const times = order.items.map((i) => i.product?.prep_time_minutes ?? DEFAULT_PREP_MINUTES);
  return times.length > 0 ? Math.max(...times) : DEFAULT_PREP_MINUTES;
}

/** Minutos que faltan para que la comanda deba salir. Negativo = va tarde. */
function minutesLeft(order: OrderView, now: number): number {
  const elapsed = (now - new Date(order.created_at).getTime()) / 60000;
  return orderPrepMinutes(order) - elapsed;
}

function countdownStyle(left: number): { text: string; late: boolean; className: string } {
  if (left <= 0) {
    return {
      text: `${Math.max(0, Math.floor(-left))} min tarde`,
      late: true,
      className: "bg-red-600 text-white",
    };
  }
  const remaining = Math.max(1, Math.ceil(left));
  return {
    text: `${remaining} min`,
    late: false,
    className: remaining <= 3 ? "bg-amber-500 text-white" : "bg-neutral-200 text-neutral-700",
  };
}

export function OrdersPage() {
  const { restaurant } = useAuth();
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [voiceFeedback, setVoiceFeedback] = useState<{
    message: string;
    canUndo?: boolean;
  } | null>(null);
  // Lo último que captó el micrófono. Se muestra en pantalla para que se vea de
  // un vistazo si está oyendo, y con qué palabras exactas llega el dictado.
  const [heard, setHeard] = useState("");

  const {
    supported: soundSupported,
    ready: soundReady,
    enable: enableSound,
    play: playAlert,
  } = useKitchenAlert();

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

  // Reloj propio: el tiempo restante cambia aunque no lleguen comandas nuevas.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Campana al entrar una comanda nueva. La primera carga solo registra lo que
  // ya existía: abrir la pantalla no debe sonar como si acabaran de pedir.
  const seenOrderIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (loading) return;
    const ids = orders.map((o) => o.id);
    if (seenOrderIdsRef.current === null) {
      seenOrderIdsRef.current = new Set(ids);
      return;
    }
    const nuevas = ids.filter((id) => !seenOrderIdsRef.current!.has(id));
    nuevas.forEach((id) => seenOrderIdsRef.current!.add(id));
    if (nuevas.length > 0) playAlert();
  }, [orders, loading, playAlert]);

  /**
   * Número corto de comanda para poder cantarlo en voz alta ("listo 3"). Se
   * numera por orden de llegada del día, así que el número de una comanda no
   * cambia cuando entra otra nueva — imprescindible si se marca por voz.
   */
  const orderNumbers = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const map = new Map<string, number>();
    orders
      .filter((o) => new Date(o.created_at).getTime() >= startOfDay.getTime())
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .forEach((order, index) => map.set(order.id, index + 1));
    return map;
  }, [orders]);

  // Prioridad dinámica: arriba lo que debe salir antes y lo que ya va tarde.
  const pending = useMemo(
    () =>
      orders
        .filter((o) => o.status === "pendiente")
        .sort((a, b) => minutesLeft(a, now) - minutesLeft(b, now)),
    [orders, now]
  );

  const finished = useMemo(() => orders.filter((o) => o.status !== "pendiente"), [orders]);

  /**
   * Última acción revertible. Se guarda también cuando se usan los botones, no
   * solo la voz: si el cocinero toca "entregado" por error, puede decir
   * "deshacer" sin volver a la pantalla.
   */
  const lastActionRef = useRef<{
    orderId: string;
    previousStatus: OrderStatus;
    number?: number;
  } | null>(null);

  async function updateStatus(orderId: string, status: OrderStatus, record = true) {
    if (record) {
      const current = orders.find((o) => o.id === orderId);
      if (current) {
        lastActionRef.current = {
          orderId,
          previousStatus: current.status,
          number: orderNumbers.get(orderId),
        };
      }
    }
    await supabase.from("orders").update({ status }).eq("id", orderId);
    await load();
  }

  async function undoLastAction() {
    const last = lastActionRef.current;
    if (!last) {
      setVoiceFeedback({ message: "No hay nada que deshacer." });
      return;
    }
    // Se limpia antes de revertir para que un segundo "deshacer" no devuelva
    // la comanda al estado que el cocinero acaba de corregir.
    lastActionRef.current = null;
    const label = STATUS_LABELS[last.previousStatus].toLowerCase();
    setVoiceFeedback({
      message:
        last.number !== undefined
          ? `Comanda #${last.number} regresó a ${label}.`
          : `Comanda regresada a ${label}.`,
    });
    await updateStatus(last.orderId, last.previousStatus, false);
  }

  // El modo continuo puede repetir la misma frase varias veces; sin este freno
  // una sola orden hablada marcaría más de una comanda.
  const lastCommandRef = useRef<{ key: string; at: number } | null>(null);

  function handleVoiceResult(final: string) {
    if (!final.trim()) return;
    const command = parseKitchenCommand(final);
    if (!command) {
      // Sin palabra de activación es conversación de cocina: se ignora en
      // silencio. Con ella, sí conviene avisar que no se entendió la orden.
      if (hasWakeWord(final)) {
        setVoiceFeedback({ message: "Te escuché, pero no entendí el comando." });
      }
      return;
    }

    const key =
      command.action === "deshacer" ? "deshacer" : `${command.action}-${command.orderNumber}`;
    const at = Date.now();
    if (lastCommandRef.current?.key === key && at - lastCommandRef.current.at < 5000) return;
    lastCommandRef.current = { key, at };

    if (command.action === "deshacer") {
      undoLastAction();
      return;
    }

    const target = pending.find((o) => orderNumbers.get(o.id) === command.orderNumber);
    if (!target) {
      setVoiceFeedback({
        message: `No hay ninguna comanda #${command.orderNumber} en preparación.`,
      });
      return;
    }

    setVoiceFeedback({
      message:
        command.action === "entregado"
          ? `Comanda #${command.orderNumber} marcada como entregada.`
          : `Comanda #${command.orderNumber} cancelada.`,
      canUndo: true,
    });
    updateStatus(target.id, command.action);
  }

  const {
    supported: voiceSupported,
    listening,
    error: voiceError,
    start: startVoice,
    stop: stopVoice,
  } = useSpeechRecognition({
    continuous: true,
    onResult: (final, interim) => {
      const text = (final || interim).trim();
      if (text) setHeard(text);
      handleVoiceResult(final);
    },
  });

  async function toggleVoice() {
    if (listening) {
      stopVoice();
      setHeard("");
      return;
    }
    setHeard("");
    // El mismo clic desbloquea el audio: los navegadores no dejan sonar nada
    // hasta que el usuario interactúa con la página.
    await enableSound();
    startVoice();
  }

  useEffect(() => {
    if (!voiceFeedback) return;
    const id = setTimeout(() => setVoiceFeedback(null), 8000);
    return () => clearTimeout(id);
  }, [voiceFeedback]);

  if (!restaurant) return null;

  function renderOrder(order: OrderView) {
    const number = orderNumbers.get(order.id);
    const isPending = order.status === "pendiente";
    const countdown = countdownStyle(minutesLeft(order, now));

    return (
      <div
        key={order.id}
        className={`rounded-xl border bg-white p-4 ${
          isPending && countdown.late ? "border-red-300 ring-1 ring-red-200" : "border-neutral-200"
        }`}
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {number !== undefined && (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-base font-bold text-white">
                {number}
              </span>
            )}
            <div>
              <p className="font-medium">{order.table?.label ?? "Mesa desconocida"}</p>
              <p className="text-xs text-neutral-400">
                {new Date(order.created_at).toLocaleTimeString()}
              </p>
            </div>
          </div>
          {isPending ? (
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${countdown.className}`}
            >
              {countdown.text}
            </span>
          ) : (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status]}`}
            >
              {STATUS_LABELS[order.status]}
            </span>
          )}
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

        {isPending && (
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
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Cocina</h2>
        <div className="flex flex-wrap items-center gap-2">
          {soundSupported && !soundReady && (
            <button
              onClick={enableSound}
              title="Los navegadores exigen un clic antes de permitir sonido"
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
            >
              🔔 Activar sonido
            </button>
          )}
          {voiceSupported && (
            <button
              onClick={toggleVoice}
              aria-pressed={listening}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                listening
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "border border-neutral-300 hover:bg-neutral-100"
              }`}
            >
              {listening ? "🎤 Escuchando… (tocar para parar)" : "🎤 Escuchar comandos"}
            </button>
          )}
        </div>
      </div>

      {listening && (
        <p className="mb-3 text-xs text-neutral-500">
          Empieza siempre con <strong>“Diccu”</strong> (o “Hey Diccu”); sin eso se ignora lo que se
          hable en la cocina. Ejemplos: <strong>“Diccu, listo 3”</strong> ·{" "}
          <strong>“Diccu, cancelar 3”</strong> · <strong>“Hey Diccu, deshacer”</strong>.
        </p>
      )}
      {listening && (
        <p className="mb-3 truncate text-xs text-neutral-400">
          Micrófono: {heard ? <em>“{heard}”</em> : "esperando a que alguien hable…"}
        </p>
      )}
      {voiceError && <p className="mb-3 text-xs text-red-600">{voiceError}</p>}

      {voiceFeedback && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm">
          <span>{voiceFeedback.message}</span>
          {voiceFeedback.canUndo && (
            <button
              onClick={() => undoLastAction()}
              className="shrink-0 font-medium text-brand-700 hover:underline"
            >
              Deshacer
            </button>
          )}
        </div>
      )}

      {loading && orders.length === 0 ? (
        <p className="text-neutral-500">Cargando…</p>
      ) : (
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              En preparación ({pending.length})
            </h3>
            {pending.length === 0 ? (
              <p className="text-neutral-500">No hay comandas pendientes.</p>
            ) : (
              <div className="space-y-3">{pending.map((order) => renderOrder(order))}</div>
            )}
          </section>

          {finished.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Terminadas
              </h3>
              <div className="space-y-3">{finished.map((order) => renderOrder(order))}</div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
