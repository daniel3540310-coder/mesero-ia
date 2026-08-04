import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_MODEL = "gemini-2.0-flash";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { qrToken, message, history } = (await req.json()) as {
      qrToken: string;
      message: string;
      history: ChatMessage[];
    };

    if (!qrToken || !message) {
      return jsonResponse({ error: "Falta qrToken o message." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: table } = await supabase
      .from("tables")
      .select("*")
      .eq("qr_token", qrToken)
      .maybeSingle();

    if (!table) return jsonResponse({ error: "Mesa no encontrada." }, 404);

    const { data: restaurant } = await supabase
      .from("restaurants")
      .select("*")
      .eq("id", table.restaurant_id)
      .eq("status", "active")
      .maybeSingle();

    if (!restaurant) return jsonResponse({ error: "Restaurante no disponible." }, 404);

    const [{ data: categories }, { data: products }, { data: policies }, { data: knowledge }] =
      await Promise.all([
        supabase.from("categories").select("*").eq("restaurant_id", restaurant.id),
        supabase.from("products").select("*, ingredients(*)").eq("restaurant_id", restaurant.id),
        supabase.from("policies").select("*").eq("restaurant_id", restaurant.id),
        supabase.from("ai_knowledge").select("*").eq("restaurant_id", restaurant.id),
      ]);

    const systemPrompt = buildSystemPrompt({
      restaurant,
      categories: categories ?? [],
      products: products ?? [],
      policies: policies ?? [],
      knowledge: knowledge ?? [],
      tableLabel: table.label,
    });

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return jsonResponse({ error: "GEMINI_API_KEY no configurada." }, 500);

    const contents = [
      ...((history ?? []) as ChatMessage[]).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      { role: "user", parts: [{ text: message }] },
    ];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", errText);
      return jsonResponse({ error: "El asistente no está disponible en este momento." }, 502);
    }

    const data = await response.json();
    const reply: string =
      data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ??
      "No tengo una respuesta para eso en este momento.";

    return jsonResponse({ reply });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "Error interno del asistente." }, 500);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface PromptInput {
  restaurant: { name: string; description: string | null };
  categories: { id: string; name: string }[];
  products: {
    id: string;
    category_id: string;
    name: string;
    description: string | null;
    price: number;
    prep_time_minutes: number | null;
    is_available: boolean;
    ingredients: { name: string; is_modifiable: boolean; is_allergen: boolean }[];
  }[];
  policies: { content: string }[];
  knowledge: { category: string; title: string; content: string }[];
  tableLabel: string;
}

function buildSystemPrompt(input: PromptInput): string {
  const menuText = input.categories
    .map((cat) => {
      const items = input.products.filter((p) => p.category_id === cat.id && p.is_available);
      if (items.length === 0) return null;
      const itemLines = items.map((p) => {
        const ingredientNames = p.ingredients.map((i) => i.name).join(", ");
        const modifiable = p.ingredients.filter((i) => i.is_modifiable).map((i) => i.name);
        const allergens = p.ingredients.filter((i) => i.is_allergen).map((i) => i.name);
        return [
          `- ${p.name} ($${p.price}): ${p.description ?? ""}`,
          ingredientNames ? `  Ingredientes: ${ingredientNames}` : null,
          modifiable.length ? `  Se puede quitar: ${modifiable.join(", ")}` : null,
          allergens.length ? `  Alérgenos: ${allergens.join(", ")}` : null,
          p.prep_time_minutes ? `  Tiempo estimado: ${p.prep_time_minutes} min` : null,
        ]
          .filter(Boolean)
          .join("\n");
      });
      return `### ${cat.name}\n${itemLines.join("\n")}`;
    })
    .filter(Boolean)
    .join("\n\n");

  const policiesText = input.policies.map((p) => `- ${p.content}`).join("\n") || "Ninguna.";
  const knowledgeText =
    input.knowledge.map((k) => `- [${k.category}] ${k.title}: ${k.content}`).join("\n") ||
    "Ninguna.";

  return `Eres el asistente virtual de "${input.restaurant.name}", atendiendo a un cliente en la ${input.tableLabel} vía chat.

${input.restaurant.description ? `Descripción del restaurante: ${input.restaurant.description}` : ""}

MENÚ DISPONIBLE:
${menuText || "El menú aún no está disponible."}

POLÍTICAS QUE DEBES RESPETAR SIEMPRE:
${policiesText}

INFORMACIÓN ADICIONAL AUTORIZADA POR EL RESTAURANTE:
${knowledgeText}

REGLAS ESTRICTAS:
- Responde ÚNICAMENTE con la información proporcionada arriba.
- Nunca inventes platillos, precios, promociones ni políticas que no estén aquí.
- Nunca prometas algo que el restaurante no haya autorizado explícitamente.
- Si no sabes algo, dilo claramente y sugiere preguntar a un mesero humano.
- Sé breve, amable y útil. No reemplazas al restaurante, lo representas.`;
}
