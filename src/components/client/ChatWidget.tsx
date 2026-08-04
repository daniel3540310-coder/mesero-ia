import { useState, type FormEvent } from "react";
import { askRestaurantAssistant, type ChatMessage } from "../../lib/gemini";

export function ChatWidget({ qrToken }: { qrToken: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
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

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const reply = await askRestaurantAssistant(qrToken, text, messages);
      setMessages([...nextMessages, { role: "assistant", content: reply }]);
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
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
              m.role === "user"
                ? "ml-auto bg-brand-600 text-white"
                : "bg-neutral-100 text-neutral-800"
            }`}
          >
            {m.content}
          </div>
        ))}
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
