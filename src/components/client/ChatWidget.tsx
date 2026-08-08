import { useState, type FormEvent } from "react";
import { askRestaurantAssistant, type ChatMessage } from "../../lib/gemini";
import type { Product } from "../../types/database";

interface DisplayMessage extends ChatMessage {
  productIds?: string[];
}

export function ChatWidget({ qrToken, products }: { qrToken: string; products: Product[] }) {
  const [messages, setMessages] = useState<DisplayMessage[]>([
    {
      role: "assistant",
      content: "¡Hola! Soy el asistente virtual. ¿En qué te puedo ayudar hoy?",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
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
      const { reply, productIds } = await askRestaurantAssistant(qrToken, text, messages);
      setMessages([...nextMessages, { role: "assistant", content: reply, productIds }]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No pudimos contactar al asistente."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => {
          const mentioned = (m.productIds ?? [])
            .map((id) => products.find((p) => p.id === id))
            .filter((p): p is Product => !!p && !!p.image_url);

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
