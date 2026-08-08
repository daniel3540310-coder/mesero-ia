import { useState, type FormEvent } from "react";
import { askRestaurantAssistant, type ChatMessage, type ProposedOrderItem } from "../../lib/gemini";
import type { CartLine } from "./CartDrawer";
import type { Product } from "../../types/database";

interface DisplayMessage extends ChatMessage {
  productIds?: string[];
  orderItems?: ProposedOrderItem[];
  ordered?: boolean;
}

export function ChatWidget({
  qrToken,
  products,
  onOrder,
}: {
  qrToken: string;
  products: Product[];
  onOrder: (lines: CartLine[]) => Promise<void>;
}) {
  const [messages, setMessages] = useState<DisplayMessage[]>([
    {
      role: "assistant",
      content: "¡Hola! Soy el asistente virtual. ¿En qué te puedo ayudar hoy?",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [ordering, setOrdering] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const nextMessages: DisplayMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const { reply, productIds, orderItems } = await askRestaurantAssistant(
        qrToken,
        text,
        messages
      );
      setMessages([...nextMessages, { role: "assistant", content: reply, productIds, orderItems }]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No pudimos contactar al asistente."
      );
    } finally {
      setSending(false);
    }
  }

  async function handleOrder(messageIndex: number, items: ProposedOrderItem[]) {
    const lines: CartLine[] = items
      .map((item) => {
        const product = products.find((p) => p.id === item.productId);
        if (!product) return null;
        const line: CartLine = {
          key: `chat-${item.productId}-${Date.now()}`,
          product,
          quantity: item.quantity,
          removedIngredients: [] as string[],
          notes: item.notes ?? "",
        };
        return line;
      })
      .filter((l): l is CartLine => l !== null);

    if (lines.length === 0) return;

    setOrdering(messageIndex);
    setError(null);
    try {
      await onOrder(lines);
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
                    Tu pedido
                  </p>
                  <ul className="mb-2 space-y-1 text-sm">
                    {orderLines.map(({ item, product }) => (
                      <li key={item.productId}>
                        {item.quantity}x {product.name}
                        {item.notes && (
                          <span className="text-neutral-500"> — {item.notes}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="mb-2 text-sm font-medium">Total: ${total.toFixed(2)}</p>
                  <button
                    onClick={() => handleOrder(i, m.orderItems!)}
                    disabled={m.ordered || ordering === i}
                    className="w-full rounded-lg bg-brand-600 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                  >
                    {m.ordered ? "Pedido enviado ✓" : ordering === i ? "Ordenando…" : "Ordenar"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {sending && <p className="text-xs text-neutral-400">Escribiendo…</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-neutral-200 p-3">
        <input
          className="flex-1 rounded-full border border-neutral-300 px-4 py-2 text-sm"
          placeholder="Escribe tu pregunta…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          disabled={sending}
          className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
