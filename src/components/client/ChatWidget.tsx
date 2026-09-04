import { useMemo, useRef, useState, type FormEvent } from "react";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import { ASSISTANT_UNAVAILABLE, askOpenQuestion, type AssistantScope } from "../../lib/askAssistant";
import { processTurn, type EngineContext } from "../../lib/orderEngine";
import { useCart } from "../../contexts/CartContext";
import type {
  AiKnowledge,
  Category,
  Ingredient,
  Policy,
  Product,
} from "../../types/database";
import { COURSE_LABELS, COURSE_ORDER } from "../../types/database";

interface DisplayMessage {
  role: "user" | "assistant";
  content: string;
  productIds?: string[];
}

export function ChatWidget({
  scope,
  restaurantName,
  tableLabel,
  categories,
  products,
  ingredients,
  policies,
  knowledge,
  onOrder,
  confirmationMessage = "¡Listo! Tu pedido ya está en cocina. ¿Te sirvo algo más?",
}: {
  scope: AssistantScope;
  restaurantName: string;
  tableLabel: string;
  categories: Category[];
  products: Product[];
  ingredients: Ingredient[];
  policies: Policy[];
  knowledge: AiKnowledge[];
  onOrder: () => Promise<void>;
  /** Qué decir tras enviar: no es lo mismo una mesa que un domicilio. */
  confirmationMessage?: string;
}) {
  const ctx: EngineContext = useMemo(() => {
    const byProduct = new Map<string, Ingredient[]>();
    for (const ing of ingredients) {
      const list = byProduct.get(ing.product_id) ?? [];
      list.push(ing);
      byProduct.set(ing.product_id, list);
    }
    return {
      restaurantName,
      tableLabel,
      categories,
      products,
      ingredientsByProduct: byProduct,
      policies,
      knowledge,
    };
  }, [restaurantName, tableLabel, categories, products, ingredients, policies, knowledge]);

  const [messages, setMessages] = useState<DisplayMessage[]>([
    {
      role: "assistant",
      content: `¡Hola! Soy tu mesero digital en ${restaurantName}. Dime qué te sirvo, o escribe "menú" para ver la carta.`,
    },
  ]);
  // La comanda vive en el carrito compartido: lo que se pida aquí aparece en
  // el menú manual y al revés.
  const { draft, setDraft, clear } = useCart();
  const [input, setInput] = useState("");
  const [ordering, setOrdering] = useState(false);
  const [ordered, setOrdered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Consulta abierta en vuelo. No bloquea nada: el cliente puede seguir
  // pidiendo mientras llega (o mientras no llega).
  const [consulting, setConsulting] = useState(false);

  // Lo que ya estaba escrito cuando empezó el dictado: el texto reconocido se
  // agrega a eso en vez de reemplazarlo.
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

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    if (listening) stopDictation();

    setInput("");
    setError(null);
    setOrdered(false);

    // El motor es síncrono: la respuesta aparece en el mismo instante, sin
    // red de por medio ni estados de carga.
    const result = processTurn(text, draft, ctx);
    setDraft(result.draft);

    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      // En una duda abierta no se muestra el "no entendí" del motor: se pasa
      // directo a consultar, y el mensaje definitivo llega después.
      ...(result.fallback
        ? []
        : [{ role: "assistant" as const, content: result.reply, productIds: result.productIds }]),
    ]);

    if (result.fallback) askOpenQuestionSafely(text, history);
  }

  /**
   * Duda abierta: se delega a Gemini en segundo plano.
   *
   * Está aislado del pedido a propósito. `askOpenQuestion` nunca lanza, así que
   * un fallo de cuota, un 503 o quedarse sin red no pueden congelar el chat ni
   * tocar la comanda; en el peor caso el comensal ve un mensaje amable y sigue
   * ordenando con el motor local.
   */
  function askOpenQuestionSafely(question: string, history: { role: "user" | "assistant"; content: string }[]) {
    setConsulting(true);
    askOpenQuestion(scope, question, history)
      .then((answer) => {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: answer ?? ASSISTANT_UNAVAILABLE },
        ]);
      })
      .finally(() => setConsulting(false));
  }

  async function handleOrder() {
    if (draft.lines.length === 0 || ordering) return;
    setOrdering(true);
    setError(null);
    try {
      await onOrder();
      setOrdered(true);
      clear();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: confirmationMessage },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar el pedido.");
    } finally {
      setOrdering(false);
    }
  }

  const total = draft.lines.reduce((sum, l) => sum + l.product.price * l.quantity, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => {
          const mentioned = (m.productIds ?? [])
            .map((id) => products.find((p) => p.id === id))
            .filter((p): p is Product => !!p && !!p.image_url);

          return (
            <div key={i} className={m.role === "user" ? "ml-auto max-w-[80%]" : "max-w-[85%]"}>
              <div
                className={`rounded-2xl px-4 py-2 text-sm ${
                  m.role === "user" ? "bg-brand-600 text-white" : "bg-neutral-100 text-neutral-800"
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
        {consulting && <p className="text-xs text-neutral-400">Déjame consultar…</p>}
        {ordered && (
          <p className="text-center text-xs font-medium text-green-700">✅ Pedido enviado a cocina</p>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      {/* El pedido en curso vive a la vista, como el carrito del menú manual:
          el cliente ve acumularse lo que lleva en vez de fiarse del chat. */}
      {draft.lines.length > 0 && (
        <div className="border-t border-brand-200 bg-brand-50 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
            Tu pedido{draft.diners ? ` · ${draft.diners} personas` : ""}
          </p>
          <div className="mb-2 max-h-32 overflow-y-auto">
            {COURSE_ORDER.filter((course) => draft.lines.some((l) => l.course === course)).map(
              (course) => (
                <div key={course}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                    {COURSE_LABELS[course]}
                  </p>
                  <ul className="mb-1 space-y-0.5 text-sm">
                    {draft.lines
                      .filter((l) => l.course === course)
                      .map((line) => (
                        <li key={line.key}>
                          {line.quantity}x {line.product.name}
                          <span className="text-brand-700">
                            {line.seat ? ` · Comensal ${line.seat}` : " · Compartir"}
                          </span>
                          {line.removedIngredients.length > 0 && (
                            <span className="text-neutral-500">
                              {" "}
                              sin {line.removedIngredients.join(", ")}
                            </span>
                          )}
                          {line.notes && <span className="text-neutral-500"> — {line.notes}</span>}
                        </li>
                      ))}
                  </ul>
                </div>
              )
            )}
          </div>
          <button
            onClick={handleOrder}
            disabled={ordering}
            className="w-full rounded-lg bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {ordering ? "Ordenando…" : `Ordenar · $${total.toFixed(2)}`}
          </button>
        </div>
      )}

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
            placeholder={listening ? "Escuchando…" : "Ej. dos hamburguesas sin cebolla"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          {voiceSupported && (
            <button
              type="button"
              onClick={toggleDictation}
              aria-pressed={listening}
              aria-label={listening ? "Detener dictado por voz" : "Dictar por voz"}
              className={`rounded-full px-3 py-2 text-base leading-none transition ${
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
            className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white"
          >
            Enviar
          </button>
        </form>
      </div>
    </div>
  );
}
