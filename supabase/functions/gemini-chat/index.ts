import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-3.6-flash";

/**
 * Cuántos mensajes previos se le mandan a Gemini. El chat de una mesa no
 * necesita memoria larga y un historial que crece sin límite encarece y
 * ralentiza cada respuesta hasta que empieza a fallar.
 */
const MAX_HISTORY_MESSAGES = 8;

/** Corte de seguridad para que una llamada colgada no deje la función viva. */
const UPSTREAM_TIMEOUT_MS = 60_000;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface MenuProduct {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  prep_time_minutes: number | null;
  is_available: boolean;
  ingredients: { name: string; is_modifiable: boolean; is_allergen: boolean }[];
}

type Course = "bebida" | "entrada" | "fuerte" | "postre";
const COURSES: Course[] = ["bebida", "entrada", "fuerte", "postre"];

interface ProposedItem {
  productId: string;
  quantity: number;
  notes?: string;
  /** Comensal al que va el platillo; se omite si es para compartir. */
  seat?: number;
  course: Course;
}

interface AssistantResult {
  reply: string;
  productIds: string[];
  orderItems: ProposedItem[];
  /** Comensales en la mesa, si el cliente lo dijo. */
  diners?: number;
  /**
   * Cuántas líneas propuso el modelo y cuántas sobrevivieron a la validación.
   * Solo se incluye cuando se descartó alguna: distingue "el modelo no pidió
   * nada" de "pidió platillos que no existen en el menú", que se ven igual
   * desde el cliente pero se arreglan de forma muy distinta.
   */
  droppedItems?: { proposed: number; kept: number };
}

/** Tope duro para que una comanda absurda no tumbe la pantalla de cocina. */
const MAX_ORDER_ITEMS = 40;
const MAX_SEATS = 50;

/** Cada producto con el tiempo que le corresponde según su categoría. */
type MenuIndex = Map<string, { product: MenuProduct; defaultCourse: Course }>;

function stripAccents(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Deduce el tiempo a partir del nombre de la categoría del restaurante. Sirve
 * de respaldo cuando el modelo no clasifica un platillo, y aprovecha la
 * organización que el propio restaurante ya le dio a su menú.
 */
function inferCourse(categoryName: string): Course {
  const name = stripAccents(categoryName);
  if (/bebida|refresco|coctel|cocktail|mocktail|cerveza|beer|vino|wine|jugo|juice|cafe|coffee|licor|trago|agua|water|smoothie|drink|bar|agave|mezcal|tequila|burbuja|champagne|soda|mixolog|mezcalita|margarita|bebidas|barra|refrescos/.test(name)) {
    return "bebida";
  }
  if (/entrada|aperitivo|botana|snack|ensalada|salad|sopa|soup|crema|appetizer|starter|compartir|share|share/.test(name)) return "entrada";
  if (/postre|dulce|helado|pastel|dessert|sweet|ice cream/.test(name)) return "postre";
  return "fuerte";
}

function buildMenuIndex(
  products: MenuProduct[],
  categories: { id: string; name: string }[]
): MenuIndex {
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
  return new Map(
    products.map((product) => [
      product.id,
      { product, defaultCourse: inferCourse(categoryNames.get(product.category_id) ?? "") },
    ])
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { qrToken, message, history, stream } = (await req.json()) as {
      qrToken: string;
      message: string;
      history: ChatMessage[];
      stream?: boolean;
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

    const menuProducts = (products ?? []) as MenuProduct[];
    const menuCategories = (categories ?? []) as { id: string; name: string }[];
    const menuIndex = buildMenuIndex(menuProducts, menuCategories);

    const systemPrompt = buildSystemPrompt({
      restaurant,
      categories: menuCategories,
      products: menuProducts,
      policies: policies ?? [],
      knowledge: knowledge ?? [],
      tableLabel: table.label,
    });

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return jsonResponse({ error: "GEMINI_API_KEY no configurada." }, 500);

    const body = buildGeminiBody(systemPrompt, history ?? [], message);

    return stream
      ? await streamAnswer(apiKey, body, menuIndex)
      : await completeAnswer(apiKey, body, menuIndex);
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "Error interno del asistente." }, 500);
  }
});

/* -------------------------------------------------------------------------- */
/* Llamada a Gemini                                                            */
/* -------------------------------------------------------------------------- */

function geminiUrl(apiKey: string, streaming: boolean): string {
  const method = streaming ? "streamGenerateContent" : "generateContent";
  const suffix = streaming ? "&alt=sse" : "";
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:${method}?key=${apiKey}${suffix}`;
}

function buildGeminiBody(systemPrompt: string, history: ChatMessage[], message: string) {
  // Solo los últimos mensajes: el resto ya no aporta contexto útil y sí latencia.
  const recent = history.slice(-MAX_HISTORY_MESSAGES);

  // Gemini espera que la conversación arranque con el cliente. Al recortar, el
  // primer mensaje puede quedar siendo del asistente (el saludo inicial), así
  // que se descartan los que sobren al principio.
  let start = 0;
  while (start < recent.length && recent[start].role === "assistant") start++;

  const contents = [
    ...recent.slice(start).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  return {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        // "reply" va primero a propósito: al transmitir la respuesta se puede
        // ir mostrando el texto sin esperar al resto del JSON.
        propertyOrdering: ["reply", "productIds", "orderItems", "diners"],
        properties: {
          reply: { type: "STRING" },
          productIds: { type: "ARRAY", items: { type: "STRING" } },
          orderItems: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              // "seat" va como obligatorio-pero-anulable a propósito:
              // declarado como opcional el modelo lo omitía y colapsaba a
              // varias personas en una sola línea. Obligarlo a escribir null
              // es lo que hace que reparta bien por comensal.
              //
              // "course" NO se le pide al modelo: al tener que elegir a la vez
              // comensal y tiempo dejaba de proponer nada en comandas de
              // varias personas con bebidas. El tiempo se deduce en el
              // servidor desde la categoría del menú, que es más fiable y ya
              // refleja cómo el restaurante organizó su carta.
              propertyOrdering: ["productId", "seat", "quantity", "notes"],
              properties: {
                productId: { type: "STRING" },
                seat: { type: "INTEGER", nullable: true },
                quantity: { type: "INTEGER" },
                notes: { type: "STRING", nullable: true },
              },
              required: ["productId", "seat", "quantity"],
            },
          },
          diners: { type: "INTEGER" },
        },
        required: ["reply"],
      },
    },
  };
}

async function callGemini(url: string, body: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Respuesta de una sola pieza (sirve de respaldo si el streaming falla). */
async function completeAnswer(
  apiKey: string,
  body: unknown,
  menu: MenuIndex
): Promise<Response> {
  const response = await callGemini(geminiUrl(apiKey, false), body);

  if (!response.ok) {
    const errText = await response.text();
    console.error("Gemini API error:", response.status, errText);
    return jsonResponse(
      {
        error: "El asistente no está disponible en este momento.",
        detail: `gemini_http_${response.status}: ${errText.slice(0, 400)}`,
      },
      502
    );
  }

  const data = await response.json();
  const rawText: string =
    data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";

  return jsonResponse(buildResult(rawText, menu));
}

/**
 * Respuesta transmitida por Server-Sent Events.
 *
 * Gemini devuelve el JSON estructurado por trozos. Se va extrayendo el campo
 * "reply" a medida que llega para que el cliente muestre el texto enseguida, y
 * al terminar se manda un evento "done" con los datos ya validados (los ids de
 * platillos y el pedido propuesto), que es lo que alimenta las fotos y el botón
 * de ordenar.
 */
async function streamAnswer(
  apiKey: string,
  body: unknown,
  menu: MenuIndex
): Promise<Response> {
  const upstream = await callGemini(geminiUrl(apiKey, true), body);

  if (!upstream.ok || !upstream.body) {
    const errText = upstream.body ? await upstream.text() : "";
    console.error("Gemini stream error:", upstream.status, errText);
    return jsonResponse(
      {
        error: "El asistente no está disponible en este momento.",
        detail: `gemini_http_${upstream.status}: ${errText.slice(0, 400)}`,
      },
      502
    );
  }

  const encoder = new TextEncoder();

  const sse = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let rawJson = "";
      let sentReply = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;

            let chunkText = "";
            try {
              const chunk = JSON.parse(payload);
              chunkText =
                chunk.candidates?.[0]?.content?.parts
                  ?.map((p: { text?: string }) => p.text ?? "")
                  .join("") ?? "";
            } catch {
              continue; // trozo aún incompleto
            }
            if (!chunkText) continue;

            rawJson += chunkText;
            const partial = extractPartialReply(rawJson);
            if (partial !== null && partial.length > sentReply.length) {
              send("delta", { text: partial.slice(sentReply.length) });
              sentReply = partial;
            }
          }
        }

        send("done", buildResult(rawJson, menu));
      } catch (err) {
        console.error("Gemini stream interrumpido:", err);
        send("error", { error: "Se interrumpió la respuesta del asistente." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(sse, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Lectura de la respuesta                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Extrae el valor de "reply" de un JSON que todavía puede estar a medias.
 * Devuelve null mientras el campo no haya empezado a llegar.
 */
function extractPartialReply(json: string): string | null {
  const keyIndex = json.indexOf('"reply"');
  if (keyIndex === -1) return null;

  const colon = json.indexOf(":", keyIndex + 7);
  if (colon === -1) return null;

  const open = json.indexOf('"', colon + 1);
  if (open === -1) return null;

  let out = "";
  for (let i = open + 1; i < json.length; i++) {
    const ch = json[i];
    if (ch === '"') return out; // cadena completa
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = json[i + 1];
    if (next === undefined) return out; // el escape llega partido: se corta aquí
    i++;
    if (next === "n") out += "\n";
    else if (next === "t") out += "\t";
    else if (next === "r") out += "\r";
    else if (next === "u") {
      const hex = json.slice(i + 1, i + 5);
      if (hex.length < 4) return out;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 4;
    } else out += next; // \" \\ \/ y demás
  }
  return out; // aún incompleta
}

/**
 * Valida la respuesta del modelo contra el menú real. Nunca se confía en los
 * ids que devuelve: podría inventar un platillo que no existe o proponer uno
 * agotado.
 */
function buildResult(rawText: string, menu: MenuIndex): AssistantResult {
  const result: AssistantResult = {
    reply: "No tengo una respuesta para eso en este momento.",
    productIds: [],
    orderItems: [],
  };

  try {
    const parsed = JSON.parse(rawText) as {
      reply?: string;
      productIds?: string[];
      orderItems?: {
        productId?: string;
        quantity?: number;
        notes?: string;
        seat?: number;
        course?: string;
      }[];
      diners?: number;
    };
    if (parsed.reply) result.reply = parsed.reply;

    if (Array.isArray(parsed.productIds)) {
      result.productIds = parsed.productIds.filter((id) => menu.has(id));
    }

    if (Array.isArray(parsed.orderItems)) {
      result.orderItems = parsed.orderItems
        .filter((item) => !!item.productId && !!menu.get(item.productId)?.product.is_available)
        // Tope duro: una comanda de cientos de líneas solo puede ser un error
        // del modelo, y dejarla pasar bloquearía la pantalla de cocina.
        .slice(0, MAX_ORDER_ITEMS)
        .map((item) => {
          const entry = menu.get(item.productId!)!;
          const seat = Math.trunc(item.seat ?? 0);
          const course = COURSES.includes(item.course as Course)
            ? (item.course as Course)
            : entry.defaultCourse;

          return {
            productId: item.productId!,
            quantity: Math.min(Math.max(Math.trunc(item.quantity ?? 1), 1), 20),
            notes:
              typeof item.notes === "string" && item.notes.trim() ? item.notes.trim() : undefined,
            // Un comensal fuera de rango se trata como "para compartir": es
            // preferible a asignar el platillo a una persona inventada.
            seat: seat >= 1 && seat <= MAX_SEATS ? seat : undefined,
            course,
          };
        });
    }

    const proposed = Array.isArray(parsed.orderItems) ? parsed.orderItems.length : 0;
    if (proposed !== result.orderItems.length) {
      console.error("orderItems descartados:", { proposed, kept: result.orderItems.length });
      result.droppedItems = { proposed, kept: result.orderItems.length };
    }

    const diners = Math.trunc(parsed.diners ?? 0);
    if (diners >= 1 && diners <= MAX_SEATS) result.diners = diners;
  } catch {
    // Si el modelo no devolvió JSON válido (raro con responseSchema), se usa el
    // texto crudo como respuesta, sin imágenes ni pedido.
    const partial = extractPartialReply(rawText);
    if (partial) result.reply = partial;
    else if (rawText.trim()) result.reply = rawText;
  }

  return result;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* -------------------------------------------------------------------------- */
/* Prompt                                                                      */
/* -------------------------------------------------------------------------- */

interface PromptInput {
  restaurant: { name: string; description: string | null };
  categories: { id: string; name: string }[];
  products: MenuProduct[];
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
          `- [id:${p.id}] ${p.name} ($${p.price}): ${p.description ?? ""}`,
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
- Sé breve, amable y útil. No reemplazas al restaurante, lo representas.
- Cada platillo del menú tiene un [id:...]. Cuando recomiendes o menciones un
  platillo específico, incluye su id en "productIds" para que el cliente vea
  su foto. No incluyas ids de platillos que no mencionaste. El texto de
  "reply" nunca debe mostrar el id en crudo al cliente.
- Cuando el cliente diga explícitamente qué quiere ordenar (con cantidad y
  platillo claros) y tú se lo hayas confirmado en tu respuesta, llena
  "orderItems" con esos platillos exactos (id, cantidad, y notas si pidió
  alguna modificación o especificación). El cliente verá un botón para
  confirmar ese pedido, así que "orderItems" debe reflejar EXACTAMENTE lo
  que el cliente pidió, ni más ni menos.
- Si el cliente todavía está preguntando, decidiendo, o no ha confirmado
  cantidades, deja "orderItems" vacío — no asumas que quiere ordenar.
- Nunca pongas en "orderItems" un platillo que el cliente no pidió
  explícitamente, aunque lo hayas recomendado.

MESAS CON VARIOS COMENSALES:
- Si en la mesa comen varias personas, usa "seat" para indicar a qué comensal
  va cada platillo, numerándolos como los nombre el cliente (persona 1, 2, 3…).
  Mantén el mismo número para la misma persona durante toda la conversación.
- Deja "seat" vacío solo cuando el platillo sea para compartir entre todos.
- Nunca inventes comensales ni repartas platillos por tu cuenta: si el cliente
  no dijo para quién es cada cosa, deja "seat" vacío y pregúntale.
- Si el cliente dice cuántos son, ponlo en "diners".
- Una sola línea de "orderItems" por comensal: para dos personas que quieren lo
  mismo, usa dos entradas con cantidad 1 y distinto "seat", no una con
  cantidad 2. Solo agrupa en cantidad cuando sea para compartir.

TIEMPOS DE LA COMIDA:
- No tienes que clasificar los platillos por tiempo: el sistema los agrupa solo
  (bebidas, entradas, fuertes, postres) según la categoría del menú.
- Si el cliente pide un platillo en un tiempo distinto al habitual ("la
  ensalada de entrada"), anótalo en "notes" para que la cocina lo vea.

MUY IMPORTANTE: si ya confirmaste el pedido en tu respuesta, SIEMPRE llena
"orderItems", por larga que sea la comanda. Confirmar de palabra y dejar
"orderItems" vacío deja al cliente sin poder ordenar.

Ejemplo de una comanda de varios comensales ya confirmada ("de entrada papas
para compartir; persona 1 y persona 2 quieren hamburguesa, la 2 sin cebolla;
y un refresco para cada una"):
  "orderItems": [
    { "productId": "<id papas>",       "seat": null, "quantity": 1 },
    { "productId": "<id hamburguesa>", "seat": 1, "quantity": 1 },
    { "productId": "<id hamburguesa>", "seat": 2, "quantity": 1, "notes": "sin cebolla" },
    { "productId": "<id refresco>",    "seat": 1, "quantity": 1 },
    { "productId": "<id refresco>",    "seat": 2, "quantity": 1 }
  ]
Las papas van sin "seat" por ser para compartir, y cada comensal tiene su
propia línea aunque dos pidan lo mismo.`;
}
