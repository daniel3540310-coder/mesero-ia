import { useRef, useState, type FormEvent } from "react";
import { askRestaurantAssistant, type ChatMessage, type ProposedOrderItem } from "../../lib/gemini";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import type { CartLine } from "./CartDrawer";
import type { Product } from "../../types/database";
import { COURSE_LABELS, COURSE_ORDER } from "../../types/database";

interface DisplayMessage extends ChatMessage {
  productIds?: string[];
  orderItems?: ProposedOrderItem[];
  diners?: number;
  ordered?: boolean;
}

export function ChatWidget({
  qrToken,
  products,
  onOrder,
}: {
  qrToken: string;
  products: Product[];
  onOrder: (lines: CartLine[], diners?: number) => Promise<void>;
}) {
  const [messages, setMessages] = useState<DisplayMessage[]>([
    {
      role: "assistant",
      content: "¡Hola! Soy el asistente virtual. ¿En qué te puedo ayudar hoy?",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [retryNotice, setRetryNotice] = useState<string | null>(null);
  const [ordering, setOrdering] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Lo que ya estaba escrito cuando empezó el dictado: el texto reconocido se
  // agrega a eso en vez de reemplazarlo, para no borrar lo que el cliente tecleó.
  const dictationBaseRef = useRef("");

  const {
    supported: voiceSupported,
    listening,
    error: voiceError,
    start: startDictation,
    stop: stopDictation,
  } = useSpeechRecognition({
    onResult: (final, interim) => {
      const spoken = `${final}${interim}`.trim();
      const base = dictationBaseRef.current;
      setInput(base && spoken ? `${base} ${spoken}` : base || spoken);
    },
  });

  function toggleDictation() {
    if (listening) {
      stopDictation();
      return;
    }
    dictationBaseRef.current = input.trim();
    startDictation();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    if (listening) stopDictation();

    const nextMessages: DisplayMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setError(null);

    setStreamingText("");
    setRetryNotice(null);

    try {
      const { reply, productIds, orderItems, diners } = await askRestaurantAssistant(
        qrToken,
        text,
        messages,
        {
          onDelta: (chunk) => setStreamingText((prev) => prev + chunk),
          onAttempt: (attempt, totalAttempts) => {
            // Cada reintento arranca de cero: se borra lo que se alcanzó a
            // mostrar para no mezclar dos respuestas distintas.
            setStreamingText("");
            setRetryNotice(attempt > 1 ? `Reintentando… (${attempt}/${totalAttempts})` : null);
          },
        }
      );
      setMessages([
        ...nextMessages,
        { role: "assistant", content: reply, productIds, orderItems, diners },
      ]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No pudimos contactar al asistente."
      );
    } finally {
      setSending(false);
      setStreamingText("");
      setRetryNotice(null);
    }
  }

  async function handleOrder(
    messageIndex: number,
    items: ProposedOrderItem[],
    diners?: number
  ) {
    const lines: CartLine[] = items
      .map((item, index) => {
        const product = products.find((p) => p.id === item.productId);
        if (!product) return null;
        const line: CartLine = {
          // El índice entra en la clave porque una misma mesa puede pedir el
          // mismo platillo para varios comensales en el mismo instante.
          key: `chat-${item.productId}-${index}-${Date.now()}`,
          product,
          quantity: item.quantity,
          removedIngredients: [] as string[],
          notes: item.notes ?? "",
          seat: item.seat ?? null,
          course: item.course,
        };
        return line;
      })
      .filter((l): l is CartLine => l !== null);

    if (lines.length === 0) return;

    setOrdering(messageIndex);
    setError(null);
    try {
      await onOrder(lines, diners);
      setMessages((prev) =>
        prev.map((m, i) => (i === messageIndex ? { ...m, ordered: true } : m))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar el pedido.");
    } finally {
      setOrdering(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => {
          const mentioned = (m.productIds ?? [])
            .map((id) => products.find((p) => p.id === id))
            .filter((p): p is Product => !!p && !!p.image_url);

          const orderLines = (m.orderItems ?? [])
            .map((item) => ({ item, product: products.find((p) => p.id === item.productId) }))
            .filter((l): l is { item: ProposedOrderItem; product: Product } => !!l.product);

          const total = orderLines.reduce(
            (sum, l) => sum + l.product.price * l.item.quantity,
            0
          );

          return (
            <div key={i} className={m.role === "user" ? "ml-auto max-w-[80%]" : "max-w-[80%]"}>
              <div
                className={`rounded-2xl px-4 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-brand-600 text-white"
                    : "bg-neutral-100 text-neutral-800"
                }`}
              >
                {m.content}
              </div>
              {mentioned.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {mentioned.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white p-1.5 pr-3"
                    >
                      <img
                        src={p.image_url!}
                        alt={p.name}
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                      <span className="text-xs font-medium">{p.name}</span>
                    </div>
                  ))}
                </div>
              )}
              {orderLines.length > 0 && (
                <div className="mt-2 rounded-xl border border-brand-200 bg-brand-50 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-700">
                    Tu pedido{m.diners ? ` · ${m.diners} comensales` : ""}
                  </p>
                  {COURSE_ORDER.filter((course) =>
                    orderLines.some((l) => l.item.course === course)
                  ).map((course) => (
                    <div key={course} className="mb-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                        {COURSE_LABELS[course]}
                      </p>
                      <ul className="space-y-0.5 text-sm">
                        {orderLines
                          .filter((l) => l.item.course === course)
                          .map(({ item, product }, lineIndex) => (
                            // El índice va en la clave porque el mismo platillo
                            // puede repetirse para comensales distintos.
                            <li key={`${item.productId}-${lineIndex}`}>
                              {item.quantity}x {product.name}
                              <span className="text-brand-700">
                                {item.seat ? ` · Comensal ${item.seat}` : " · Compartir"}
                              </span>
                              {item.notes && (
                                <span className="text-neutral-500"> — {item.notes}</span>
                              )}
                            </li>
                          ))}
                      </ul>
                    </div>
                  ))}
                  <p className="mb-2 text-sm font-medium">Total: ${total.toFixed(2)}</p>
                  {m.ordered ? (
                    <div className="flex items-center justify-center gap-2 rounded-lg bg-green-100 py-1.5 text-sm font-medium text-green-700">
                      <span className="text-base">✅</span> Pedido enviado a cocina
                    </div>
                  ) : (
                    <button
                      onClick={() => handleOrder(i, m.orderItems!, m.diners)}
                      disabled={ordering === i}
                      className="w-full rounded-lg bg-brand-600 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                    >
                      {ordering === i ? "Ordenando…" : "Ordenar"}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {sending && streamingText && (
          <div className="max-w-[80%] rounded-2xl bg-neutral-100 px-4 py-2 text-sm text-neutral-800">
            {streamingText}
            <span className="ml-0.5 animate-pulse">▍</span>
          </div>
        )}
        {sending && !streamingText && <p className="text-xs text-neutral-400">Escribiendo…</p>}
        {retryNotice && <p className="text-xs text-amber-600">{retryNotice}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
      <div className="border-t border-neutral-200 p-3">
        {voiceError && <p className="mb-2 text-xs text-red-600">{voiceError}</p>}
        {listening && (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-brand-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            Escuchando… habla y toca el micrófono para terminar.
          </p>
        )}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            className="flex-1 rounded-full border border-neutral-300 px-4 py-2 text-sm"
            placeholder={listening ? "Escuchando…" : "Escribe tu pregunta…"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          {voiceSupported && (
            <button
              type="button"
              onClick={toggleDictation}
              disabled={sending}
              aria-pressed={listening}
              aria-label={listening ? "Detener dictado por voz" : "Dictar por voz"}
              title={listening ? "Detener dictado" : "Dictar por voz"}
              className={`rounded-full px-3 py-2 text-base leading-none transition disabled:opacity-60 ${
                listening
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "border border-neutral-300 text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              🎤
            </button>
          )}
          <button
            type="submit"
            disabled={sending}
            className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Enviar
          </button>
        </form>
      </div>
    </div>
  );
}
