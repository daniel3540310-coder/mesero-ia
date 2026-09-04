import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Consultas abiertas del comensal — NADA MÁS.
 *
 * La comanda (agregar, quitar, comensales, tiempos, confirmar) la resuelve
 * entera el motor determinista del navegador. Esta función solo entra cuando el
 * cliente pregunta algo que el motor no puede contestar con los datos del
 * restaurante, y su respuesta es puro texto: nunca modifica el pedido.
 *
 * Si falla, no pasa nada: el cliente sigue ordenando igual.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Modelos en orden de preferencia. El primero es más capaz; los siguientes
 * tienen cuotas gratuitas más holgadas y sirven cuando el principal está
 * agotado (el plan gratis da 20 peticiones diarias por modelo).
 */
const MODELS = ["gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.6-flash"];

/** Es cortesía, no el flujo principal: se corta pronto para no hacer esperar. */
const UPSTREAM_TIMEOUT_MS = 12_000;

/** Respuestas cortas: bajan costo, latencia y consumo de cuota. */
const MAX_OUTPUT_TOKENS = 400;

/** Solo el contexto reciente; una consulta suelta no necesita más. */
const MAX_HISTORY = 4;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // El comensal puede llegar por el QR de una mesa o por el enlace de
    // domicilio, donde no hay mesa: se acepta cualquiera de los dos.
    const { qrToken, slug, question, history } = (await req.json()) as {
      qrToken?: string;
      slug?: string;
      question: string;
      history?: ChatMessage[];
    };

    if ((!qrToken && !slug) || !question) {
      return jsonResponse({ error: "Falta qrToken o slug, y question." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let restaurantId: string | null = null;
    if (qrToken) {
      const { data: table } = await supabase
        .from("tables")
        .select("restaurant_id")
        .eq("qr_token", qrToken)
        .maybeSingle();
      if (!table) return jsonResponse({ error: "Mesa no encontrada." }, 404);
      restaurantId = table.restaurant_id;
    }

    const query = supabase.from("restaurants").select("*").eq("status", "active");
    const { data: restaurant } = await (restaurantId
      ? query.eq("id", restaurantId)
      : query.ilike("slug", slug!)
    ).maybeSingle();
    if (!restaurant) return jsonResponse({ error: "Restaurante no disponible." }, 404);

    const [{ data: categories }, { data: products }, { data: policies }, { data: knowledge }] =
      await Promise.all([
        supabase.from("categories").select("*").eq("restaurant_id", restaurant.id),
        supabase.from("products").select("*, ingredients(*)").eq("restaurant_id", restaurant.id),
        supabase.from("policies").select("*").eq("restaurant_id", restaurant.id),
        supabase.from("ai_knowledge").select("*").eq("restaurant_id", restaurant.id),
      ]);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return jsonResponse({ error: "GEMINI_API_KEY no configurada." }, 500);

    const body = {
      system_instruction: {
        parts: [
          {
            text: buildPrompt({
              restaurantName: restaurant.name,
              description: restaurant.description,
              categories: categories ?? [],
              products: products ?? [],
              policies: policies ?? [],
              knowledge: knowledge ?? [],
            }),
          },
        ],
      },
      contents: [
        ...(history ?? []).slice(-MAX_HISTORY).map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        { role: "user", parts: [{ text: question }] },
      ],
      generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.4 },
    };

    const reply = await askGemini(apiKey, body);
    if (reply === null) {
      return jsonResponse({ error: "El asistente de consultas no está disponible." }, 502);
    }
    return jsonResponse({ reply });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "Error interno del asistente de consultas." }, 500);
  }
});

/** Prueba los modelos en orden; devuelve null si ninguno contestó. */
async function askGemini(apiKey: string, body: unknown): Promise<string | null> {
  for (const model of MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        console.error("Gemini no disponible:", model, response.status);
        continue; // cuota agotada o saturado: se intenta el siguiente
      }

      const data = await response.json();
      const text: string =
        data.candidates?.[0]?.content?.parts
          ?.map((p: { text?: string }) => p.text ?? "")
          .join("")
          .trim() ?? "";
      if (text) return text;
    } catch (err) {
      console.error("Gemini falló:", model, err);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

interface PromptInput {
  restaurantName: string;
  description: string | null;
  categories: { id: string; name: string }[];
  products: {
    category_id: string;
    name: string;
    description: string | null;
    price: number;
    is_available: boolean;
    ingredients: { name: string; is_modifiable: boolean; is_allergen: boolean }[];
  }[];
  policies: { content: string }[];
  knowledge: { category: string; title: string; content: string }[];
}

function buildPrompt(input: PromptInput): string {
  const menu = input.categories
    .map((cat) => {
      const items = input.products.filter((p) => p.category_id === cat.id && p.is_available);
      if (items.length === 0) return null;
      return `### ${cat.name}\n${items
        .map((p) => {
          const ing = p.ingredients?.map((i) => i.name).join(", ");
          const allergens = p.ingredients?.filter((i) => i.is_allergen).map((i) => i.name);
          return [
            `- ${p.name} ($${p.price}): ${p.description ?? ""}`,
            ing ? `  Ingredientes: ${ing}` : null,
            allergens?.length ? `  Alérgenos: ${allergens.join(", ")}` : null,
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n")}`;
    })
    .filter(Boolean)
    .join("\n\n");

  return `Eres un mesero de "${input.restaurantName}" resolviendo una duda de un comensal.
${input.description ? `\nSobre el restaurante: ${input.description}` : ""}

MENÚ:
${menu || "El menú aún no está disponible."}

POLÍTICAS:
${input.policies.map((p) => `- ${p.content}`).join("\n") || "Ninguna."}

INFORMACIÓN AUTORIZADA POR EL RESTAURANTE:
${input.knowledge.map((k) => `- [${k.category}] ${k.title}: ${k.content}`).join("\n") || "Ninguna."}

REGLAS:
- Responde ÚNICAMENTE con la información de arriba. Nunca inventes platillos,
  precios, ingredientes ni promociones.
- Si la respuesta no está en esa información, dilo con claridad y sugiere
  preguntar a un mesero. Es preferible a arriesgar un dato falso.
- NO tomes pedidos ni confirmes órdenes: de eso se encarga el sistema. Si el
  comensal quiere ordenar, invítalo a decirlo directamente ("dime cuántos y
  cuáles quieres y te los anoto").
- Responde en dos o tres frases, en español, con el tono de un mesero amable.`;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
