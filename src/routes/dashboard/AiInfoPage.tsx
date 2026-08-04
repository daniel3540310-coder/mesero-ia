import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../contexts/AuthContext";
import type { AiKnowledge, AiKnowledgeCategory } from "../../types/database";

const CATEGORY_LABELS: Record<AiKnowledgeCategory, string> = {
  historia: "Historia del restaurante",
  platillo_estrella: "Platillos estrella",
  promocion: "Promociones",
  horario: "Horarios",
  faq: "Preguntas frecuentes",
  recomendacion: "Recomendaciones",
  restriccion: "Restricciones",
  info: "Información importante",
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as AiKnowledgeCategory[];

export function AiInfoPage() {
  const { restaurant } = useAuth();
  const [entries, setEntries] = useState<AiKnowledge[]>([]);
  const [category, setCategory] = useState<AiKnowledgeCategory>("info");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  async function load() {
    if (!restaurant) return;
    const { data } = await supabase
      .from("ai_knowledge")
      .select("*")
      .eq("restaurant_id", restaurant.id);
    setEntries((data as AiKnowledge[]) ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id]);

  async function addEntry() {
    if (!restaurant || !content.trim()) return;
    await supabase.from("ai_knowledge").insert({
      restaurant_id: restaurant.id,
      category,
      title: title.trim() || CATEGORY_LABELS[category],
      content: content.trim(),
    });
    setTitle("");
    setContent("");
    await load();
  }

  async function removeEntry(id: string) {
    await supabase.from("ai_knowledge").delete().eq("id", id);
    await load();
  }

  if (!restaurant) return null;

  return (
    <div className="max-w-2xl">
      <h2 className="mb-1 text-xl font-semibold">Información para la IA</h2>
      <p className="mb-4 text-sm text-neutral-500">
        La IA solo responderá a los clientes usando esta información. Nunca inventa nada.
      </p>

      <div className="mb-6 space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr]">
          <select
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value as AiKnowledgeCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <input
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            placeholder="Título (opcional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <textarea
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          rows={3}
          placeholder="Contenido que la IA podrá usar para responder…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button
          onClick={addEntry}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Agregar
        </button>
      </div>

      <div className="space-y-3">
        {CATEGORIES.map((c) => {
          const items = entries.filter((e) => e.category === c);
          if (items.length === 0) return null;
          return (
            <div key={c}>
              <h3 className="mb-1 text-sm font-semibold text-neutral-600">
                {CATEGORY_LABELS[c]}
              </h3>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-sm text-neutral-500">{item.content}</p>
                    </div>
                    <button
                      onClick={() => removeEntry(item.id)}
                      className="shrink-0 text-sm text-red-600 hover:underline"
                    >
                      Eliminar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {entries.length === 0 && (
          <p className="text-sm text-neutral-400">Aún no has agregado información.</p>
        )}
      </div>
    </div>
  );
}
