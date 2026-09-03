import type {
  AiKnowledge,
  Category,
  Course,
  Ingredient,
  Policy,
  Product,
} from "../../types/database";
import { COURSE_LABELS, COURSE_ORDER } from "../../types/database";
import { inferCourse } from "../courses";
import { findNumber } from "../spanishNumbers";
import { findProduct, searchProducts } from "./match";
import { contentTokens, normalize, pick, similarWord, splitSegments, tokens } from "./text";

/* -------------------------------------------------------------------------- */
/* Tipos                                                                      */
/* -------------------------------------------------------------------------- */

export interface DraftLine {
  key: string;
  product: Product;
  quantity: number;
  seat: number | null;
  removedIngredients: string[];
  notes: string;
  course: Course;
}

export interface OrderDraft {
  lines: DraftLine[];
  diners: number | null;
  /** Comensal al que se asignan los platillos que vengan sin dueño explícito. */
  currentSeat: number | null;
}

export interface EngineContext {
  restaurantName: string;
  tableLabel: string;
  categories: Category[];
  products: Product[];
  ingredientsByProduct: Map<string, Ingredient[]>;
  policies: Policy[];
  knowledge: AiKnowledge[];
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface TurnResult {
  reply: string;
  draft: OrderDraft;
  /** Platillos mencionados en este turno, para mostrar sus fotos. */
  productIds: string[];
  /**
   * El motor no tiene nada fundamentado que responder: no era una acción de
   * comanda ni una consulta que se pueda contestar con los datos del
   * restaurante. Quien llama puede delegarlo a la consulta abierta.
   *
   * A propósito NO se marca en las preguntas de alérgenos sin datos: ahí la
   * respuesta prudente ("no me consta, preguntemos a un mesero") es mejor que
   * arriesgar una suposición sobre algo que puede mandar a alguien al hospital.
   */
  fallback?: boolean;
}

export const emptyDraft = (): OrderDraft => ({ lines: [], diners: null, currentSeat: null });

const MAX_LINES = 60;
const MAX_QTY = 20;
const MAX_SEATS = 50;

/* -------------------------------------------------------------------------- */
/* Detección de intenciones                                                    */
/* -------------------------------------------------------------------------- */

const RE = {
  saludo: /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|que tal|holi)\b/,
  confirmar:
    /\b(es todo|eso es todo|nada mas|ya esta|ya estaria|confirma|confirmar|confirmo|manda el pedido|manda la orden|ordenar|ya podemos ordenar|cierra la cuenta|cierra el pedido|listo asi|asi esta bien)\b/,
  verPedido: /\b(que llevo|que llevamos|mi pedido|nuestro pedido|que pedi|que pedimos|resumen|como va el pedido|cuanto llevo|cuanto va)\b/,
  vaciar: /\b(cancela todo|cancelar todo|borra todo|borrar todo|quita todo|empezar de nuevo|de cero|olvida todo)\b/,
  quitar: /\b(quita|quitar|elimina|eliminar|borra|borrar|ya no quiero|ya no queremos|cancela el|cancela la|cancela los|cancela las)\b/,
  comensales: /\b(?:somos|seremos|seriamos|vamos a ser|mesa para|para)\s+(\S+)\s*(?:personas|comensales|gente)?\b|\b(\S+)\s+(?:personas|comensales)\b/,
  precio: /\b(cuanto cuesta|cuanto vale|cuanto sale|precio|que precio|cuanto es)\b/,
  ingredientes: /\b(que lleva|que trae|que tiene|ingredientes|de que esta hecho|como viene)\b/,
  alergenos: /\b(alerg|gluten|lactosa|cacahuate|mani|nuez|nueces|mariscos|celiac|vegetarian|vegan|picante)\b/,
  recomendacion: /\b(recomienda|recomiendas|recomiendan|recomendacion|que esta bueno|que me sugieres|sugerencia|especialidad|lo mejor|mas pedido|popular)\b/,
  menu: /\b(que tienen|que hay|menu|carta|opciones|que venden|muestrame|ensename)\b/,
  ayuda: /\b(ayuda|como funciona|no entiendo|que puedo hacer)\b/,
  gracias: /\b(gracias|muchas gracias|perfecto|excelente|va|sale|ok|okey)\b/,
};

/* -------------------------------------------------------------------------- */
/* Motor                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Procesa un turno de conversación de forma determinista.
 *
 * No hay modelo de lenguaje: todo sale del menú y las reglas que el propio
 * restaurante cargó. Si algo no se entiende se dice claramente, en vez de
 * inventar — que es justo lo que pide la especificación del producto.
 */
export function processTurn(text: string, draft: OrderDraft, ctx: EngineContext): TurnResult {
  const raw = text.trim();
  const norm = normalize(raw);
  if (!norm) return { reply: pick(["¿Me repites, por favor?", "No alcancé a escucharte."]), draft, productIds: [] };

  // El orden importa: primero lo que es una orden explícita sobre el pedido,
  // porque "quita la hamburguesa" también contiene el nombre de un platillo.
  if (RE.vaciar.test(norm)) return handleClear(draft, ctx);
  if (RE.verPedido.test(norm)) return { reply: summarize(draft, ctx, true), draft, productIds: [] };
  if (RE.confirmar.test(norm)) return handleConfirm(draft, ctx);
  if (RE.quitar.test(norm)) return handleRemove(norm, draft, ctx);

  const diners = detectDiners(norm);

  // "Somos 6, queremos dos hamburguesas" trae las dos cosas: se anota el número
  // de comensales y se sigue procesando el pedido.
  let working = draft;
  let dinersNote = "";
  if (diners !== null && diners !== draft.diners) {
    working = { ...working, diners };
    dinersNote = pick([
      `Perfecto, ${diners} personas. `,
      `Anotado: mesa para ${diners}. `,
      `Muy bien, son ${diners}. `,
    ]);
  }

  // Las preguntas van ANTES de intentar agregar: "cuánto cuesta la hamburguesa"
  // nombra un platillo, pero pedir el precio no es pedir el platillo.
  const isQuestion =
    RE.recomendacion.test(norm) ||
    RE.precio.test(norm) ||
    RE.ingredientes.test(norm) ||
    RE.alergenos.test(norm) ||
    RE.menu.test(norm);

  if (isQuestion) {
    const answer = handleQuestion(norm, raw, ctx);
    if (answer) {
      return { reply: dinersNote + answer.reply, draft: working, productIds: answer.productIds };
    }
  }

  const { result: added, unmatched } = tryAddItems(raw, working, ctx);
  if (added) {
    return { ...added, reply: dinersNote + added.reply };
  }

  // No había platillos que agregar: se responde lo que se haya podido resolver.
  const asked = handleQuestion(norm, raw, ctx);
  if (asked) return { reply: dinersNote + asked.reply, draft: working, productIds: asked.productIds };
  if (dinersNote) {
    return {
      reply: dinersNote + pick(["¿Qué les sirvo?", "¿Qué van a querer?", "Cuando gusten, les tomo la orden."]),
      draft: working,
      productIds: [],
    };
  }
  if (RE.saludo.test(norm)) return { reply: greeting(ctx), draft: working, productIds: [] };
  if (RE.ayuda.test(norm)) return { reply: helpText(), draft: working, productIds: [] };
  if (RE.gracias.test(norm)) {
    return { reply: pick(["¡Con gusto!", "A la orden.", "Para servirte."]), draft: working, productIds: [] };
  }

  // "No lo tenemos en la carta" solo tiene sentido si el cliente estaba
  // pidiendo algo. Una pregunta cualquiera no es un platillo inexistente: se
  // marca como duda abierta para que el chat la delegue.
  const firstToken = tokens(norm)[0] ?? "";
  const looksLikeOrder =
    ORDER_VERB.test(norm) || SEAT_RE.test(norm) || findNumber([firstToken]) !== null;

  if (unmatched.length > 0 && looksLikeOrder) {
    return { reply: notFound(unmatched, ctx), draft: working, productIds: [] };
  }

  return { reply: notUnderstood(), draft: working, productIds: [], fallback: true };
}

/* -------------------------------------------------------------------------- */
/* Agregar platillos                                                           */
/* -------------------------------------------------------------------------- */

interface ParsedSegment {
  seat: number | null;
  seatExplicit: boolean;
  shared: boolean;
  quantity: number;
  perPerson: boolean;
  removalPhrase: string;
  rest: string;
}

/** Verbos con los que alguien pide algo; sirven para distinguir un pedido de una pregunta. */
const ORDER_VERB =
  /\b(quiero|queremos|quisiera|quisieramos|dame|danos|ponme|ponnos|pon|traeme|traenos|trae|traiga|agrega|agregame|anota|anotame|pido|pedimos|me das|nos das|sirveme|sirvenos)\b/;

const SEAT_RE = /\b(?:persona|comensal|invitado|silla|puesto)\s+(\S+)/;
const FOR_RE = /\bpara\s+(?:el|la)?\s*(\S+)/;
const SHARED_RE = /\b(compartir|para compartir|para la mesa|al centro|para todos)\b/;
const PER_PERSON_RE = /\b(cada uno|cada una|cada quien|para cada|uno por|una por)\b/;

function parseSegment(segment: string, draft: OrderDraft): ParsedSegment {
  let rest = segment;
  let seat: number | null = draft.currentSeat;
  let seatExplicit = false;
  let shared = false;

  if (SHARED_RE.test(rest)) {
    shared = true;
    seat = null;
    seatExplicit = true;
    rest = rest.replace(SHARED_RE, " ");
  }

  const seatMatch = rest.match(SEAT_RE);
  if (seatMatch) {
    const value = findNumber([seatMatch[1]]);
    if (value && value.value >= 1 && value.value <= MAX_SEATS) {
      seat = value.value;
      seatExplicit = true;
      rest = rest.replace(seatMatch[0], " ");
    }
  } else {
    // "para la 3" también asigna comensal, pero "para compartir" ya se descartó.
    const forMatch = rest.match(FOR_RE);
    if (forMatch) {
      const value = findNumber([forMatch[1]]);
      if (value && value.value >= 1 && value.value <= MAX_SEATS) {
        seat = value.value;
        seatExplicit = true;
        rest = rest.replace(forMatch[0], " ");
      }
    }
  }

  const perPerson = PER_PERSON_RE.test(rest);
  if (perPerson) rest = rest.replace(PER_PERSON_RE, " ");

  let removalPhrase = "";
  const sinIndex = rest.search(/\bsin\b/);
  if (sinIndex >= 0) {
    removalPhrase = rest.slice(sinIndex + 4).trim();
    rest = rest.slice(0, sinIndex);
  }

  // La cantidad se busca al final, cuando ya se quitaron los números que en
  // realidad eran comensales.
  let quantity = 1;
  const restTokens = tokens(rest);
  const qty = findNumber(restTokens);
  if (qty && qty.value >= 1 && qty.value <= MAX_QTY) {
    quantity = qty.value;
    restTokens.splice(qty.index, qty.length);
    rest = restTokens.join(" ");
  }

  return { seat, seatExplicit, shared, quantity, perPerson, removalPhrase, rest: rest.trim() };
}

/**
 * Aplica los "sin ..." validándolos contra los ingredientes reales.
 *
 * Es la regla más importante del producto: un ingrediente marcado como no
 * modificable no se puede quitar, y decirlo es mejor que aceptarlo y que la
 * cocina lo descubra. Cuando el restaurante no cargó ingredientes no se puede
 * validar nada, así que la petición se guarda como nota para la cocina.
 */
function applyRemovals(
  phrase: string,
  product: Product,
  ctx: EngineContext
): { removed: string[]; notes: string; refused: string[] } {
  const removed: string[] = [];
  const refused: string[] = [];
  const leftovers: string[] = [];

  const ingredients = ctx.ingredientsByProduct.get(product.id) ?? [];
  const words = contentTokens(phrase).filter((w) => w !== "ni");
  if (words.length === 0) return { removed, notes: "", refused };

  if (ingredients.length === 0) {
    return { removed, notes: `sin ${words.join(" ")}`, refused };
  }

  for (const word of words) {
    const ingredient = ingredients.find((i) =>
      contentTokens(i.name).some((t) => similarWord(t, word))
    );
    if (!ingredient) {
      leftovers.push(word);
      continue;
    }
    if (ingredient.is_modifiable) {
      if (!removed.includes(ingredient.name)) removed.push(ingredient.name);
    } else if (!refused.includes(ingredient.name)) {
      refused.push(ingredient.name);
    }
  }

  return { removed, notes: leftovers.length ? `sin ${leftovers.join(" ")}` : "", refused };
}

function courseFor(product: Product, ctx: EngineContext): Course {
  const category = ctx.categories.find((c) => c.id === product.category_id);
  return inferCourse(category?.name ?? "");
}

function makeLine(
  product: Product,
  quantity: number,
  seat: number | null,
  removed: string[],
  notes: string,
  ctx: EngineContext
): DraftLine {
  return {
    key: `${product.id}-${seat ?? "m"}-${Math.random().toString(36).slice(2, 8)}`,
    product,
    quantity,
    seat,
    removedIngredients: removed,
    notes,
    course: courseFor(product, ctx),
  };
}

/**
 * Intenta leer platillos de la frase.
 *
 * Devuelve `result: null` cuando no se agregó nada, para que quien llama pueda
 * seguir probando otras intenciones (un saludo también "no coincide" con la
 * carta, y no debe contestarse como si fuera un platillo inexistente).
 */
function tryAddItems(
  rawText: string,
  draft: OrderDraft,
  ctx: EngineContext
): { result: TurnResult | null; unmatched: string[] } {
  const segments = splitSegments(rawText);
  if (segments.length === 0) return { result: null, unmatched: [] };

  const lines = [...draft.lines];
  let currentSeat = draft.currentSeat;
  const added: DraftLine[] = [];
  const refusals: string[] = [];
  const ambiguities: { phrase: string; options: Product[] }[] = [];
  const unmatched: string[] = [];
  let seatOnly: number | null = null;

  for (const segment of segments) {
    const parsed = parseSegment(segment, { ...draft, currentSeat });
    if (parsed.seatExplicit) currentSeat = parsed.shared ? null : parsed.seat;

    if (!parsed.rest) {
      // "para la persona 3" sin platillo: fija a quién van los siguientes.
      if (parsed.seatExplicit && !parsed.shared) seatOnly = parsed.seat;
      continue;
    }

    const { match, ambiguous } = findProduct(parsed.rest, ctx.products);

    if (!match) {
      if (ambiguous.length > 1) {
        ambiguities.push({ phrase: parsed.rest, options: ambiguous.map((a) => a.product) });
      } else if (contentTokens(parsed.rest).length > 0) {
        unmatched.push(parsed.rest);
      }
      continue;
    }

    const { removed, notes, refused } = applyRemovals(parsed.removalPhrase, match.product, ctx);
    refused.forEach((name) => {
      const msg = `${match.product.name} no se puede preparar sin ${name.toLowerCase()}`;
      if (!refusals.includes(msg)) refusals.push(msg);
    });

    // "una para cada quien" con la mesa ya declarada: una línea por comensal.
    const expand = parsed.perPerson && !parsed.seatExplicit;
    const people = expand ? draft.diners ?? parsed.quantity : 0;

    if (expand && people >= 2) {
      for (let seat = 1; seat <= Math.min(people, MAX_SEATS); seat++) {
        if (lines.length + added.length >= MAX_LINES) break;
        added.push(makeLine(match.product, 1, seat, removed, notes, ctx));
      }
    } else if (lines.length + added.length < MAX_LINES) {
      added.push(makeLine(match.product, parsed.quantity, parsed.shared ? null : currentSeat, removed, notes, ctx));
    }
  }

  if (added.length === 0 && ambiguities.length === 0 && refusals.length === 0 && seatOnly === null) {
    return { result: null, unmatched };
  }

  const nextDraft: OrderDraft = {
    ...draft,
    lines: [...lines, ...added],
    currentSeat: seatOnly ?? currentSeat,
  };

  return {
    result: {
      reply: buildAddReply({ added, refusals, ambiguities, unmatched, seatOnly, draft: nextDraft, ctx }),
      draft: nextDraft,
      productIds: added.map((l) => l.product.id),
    },
    unmatched,
  };
}

/* -------------------------------------------------------------------------- */
/* Redacción de respuestas                                                     */
/* -------------------------------------------------------------------------- */

function describeLine(line: DraftLine): string {
  const parts = [`${line.quantity}x ${line.product.name}`];
  if (line.seat) parts.push(`(comensal ${line.seat})`);
  if (line.removedIngredients.length) parts.push(`sin ${line.removedIngredients.join(", ")}`);
  if (line.notes) parts.push(line.notes);
  return parts.join(" ");
}

function buildAddReply(input: {
  added: DraftLine[];
  refusals: string[];
  ambiguities: { phrase: string; options: Product[] }[];
  unmatched: string[];
  seatOnly: number | null;
  draft: OrderDraft;
  ctx: EngineContext;
}): string {
  const chunks: string[] = [];

  if (input.added.length > 0) {
    const list = input.added.map(describeLine).join(", ");
    chunks.push(pick([`Anotado: ${list}.`, `Va: ${list}.`, `Listo, agregué ${list}.`]));
  }

  for (const refusal of input.refusals) {
    chunks.push(`Una cosa: ${refusal}, es parte del platillo.`);
  }

  for (const amb of input.ambiguities) {
    chunks.push(`¿Cuál prefieres: ${amb.options.map((p) => p.name).join(" o ")}?`);
  }

  if (input.unmatched.length > 0) {
    chunks.push(`No encontré "${input.unmatched[0]}" en la carta.`);
  }

  if (input.seatOnly !== null && input.added.length === 0) {
    chunks.push(`Muy bien, lo que sigue va para el comensal ${input.seatOnly}. ¿Qué le sirvo?`);
  } else if (input.added.length > 0) {
    const total = orderTotal(input.draft);
    chunks.push(
      pick([
        `Llevas $${total.toFixed(2)}. ¿Algo más?`,
        `Van $${total.toFixed(2)}. ¿Te agrego algo más?`,
        `¿Deseas algo más? El pedido va en $${total.toFixed(2)}.`,
      ])
    );
  }

  return chunks.join(" ");
}

function orderTotal(draft: OrderDraft): number {
  return draft.lines.reduce((sum, l) => sum + l.product.price * l.quantity, 0);
}

export function summarize(draft: OrderDraft, ctx: EngineContext, conversational = false): string {
  if (draft.lines.length === 0) {
    return conversational
      ? pick(["Todavía no llevas nada. ¿Qué te sirvo?", "El pedido está vacío por ahora."])
      : "";
  }

  const parts: string[] = [];
  if (draft.diners) parts.push(`Mesa de ${draft.diners}.`);

  for (const course of COURSE_ORDER) {
    const lines = draft.lines.filter((l) => l.course === course);
    if (lines.length === 0) continue;
    parts.push(`${COURSE_LABELS[course]}: ${lines.map(describeLine).join("; ")}.`);
  }

  parts.push(`Total: $${orderTotal(draft).toFixed(2)}.`);
  void ctx;
  return parts.join(" ");
}

/* -------------------------------------------------------------------------- */
/* Otras intenciones                                                           */
/* -------------------------------------------------------------------------- */

function handleClear(draft: OrderDraft, ctx: EngineContext): TurnResult {
  void ctx;
  return {
    reply: pick(["Listo, borré el pedido. Empezamos de nuevo.", "Pedido cancelado. ¿Qué les sirvo?"]),
    draft: { ...emptyDraft(), diners: draft.diners },
    productIds: [],
  };
}

function handleConfirm(draft: OrderDraft, ctx: EngineContext): TurnResult {
  if (draft.lines.length === 0) {
    return {
      reply: pick(["Todavía no has pedido nada. ¿Qué te sirvo?", "No tengo nada anotado aún."]),
      draft,
      productIds: [],
    };
  }

  const policyNote = ctx.policies.length
    ? ` Recuerda: ${ctx.policies.map((p) => p.content).join(". ")}.`
    : "";

  return {
    reply: `${summarize(draft, ctx)}${policyNote} Si está correcto, toca "Ordenar" y lo mando a cocina.`,
    draft,
    productIds: draft.lines.map((l) => l.product.id),
  };
}

function handleRemove(norm: string, draft: OrderDraft, ctx: EngineContext): TurnResult {
  if (draft.lines.length === 0) {
    return { reply: "No tienes nada en el pedido todavía.", draft, productIds: [] };
  }

  const phrase = norm.replace(RE.quitar, " ");
  const { match } = findProduct(phrase, ctx.products);

  // Sin platillo claro se quita lo último, que es lo que suele querer decir
  // "quítalo" justo después de agregar algo.
  const target = match
    ? [...draft.lines].reverse().find((l) => l.product.id === match.product.id)
    : draft.lines[draft.lines.length - 1];

  if (!target) {
    return {
      reply: `No encontré ${match ? match.product.name : "ese platillo"} en tu pedido.`,
      draft,
      productIds: [],
    };
  }

  const lines = draft.lines.filter((l) => l.key !== target.key);
  return {
    reply: `Quité ${target.product.name}${target.seat ? ` del comensal ${target.seat}` : ""}. ${
      lines.length ? `Van $${orderTotal({ ...draft, lines }).toFixed(2)}.` : "El pedido quedó vacío."
    }`,
    draft: { ...draft, lines },
    productIds: [],
  };
}

function detectDiners(norm: string): number | null {
  const match = norm.match(RE.comensales);
  if (!match) return null;
  const word = match[1] ?? match[2];
  if (!word) return null;
  const value = findNumber([word]);
  if (!value || value.value < 1 || value.value > MAX_SEATS) return null;
  return value.value;
}

/** Responde preguntas usando únicamente los datos que cargó el restaurante. */
function handleQuestion(norm: string, raw: string, ctx: EngineContext): TurnResult | null {
  const draft = emptyDraft();

  if (RE.recomendacion.test(norm)) {
    const star = ctx.knowledge.find(
      (k) => k.category === "platillo_estrella" || k.category === "recomendacion"
    );
    // Solo se contesta local si el restaurante escribió su recomendación. Sin
    // eso, listar los tres primeros platillos de la carta sería una respuesta
    // pobre: es mejor dejar que la consulta abierta la resuelva con criterio
    // ("algo para acompañar la hamburguesa" pide entender el maridaje, no
    // recitar el menú).
    if (star) return { reply: `${star.title}: ${star.content}`, draft, productIds: [] };
    return null;
  }

  if (RE.precio.test(norm) || RE.ingredientes.test(norm) || RE.alergenos.test(norm)) {
    const found = searchProducts(raw, ctx.products, 3);
    if (found.length > 0) {
      const product = found[0];
      const ingredients = ctx.ingredientsByProduct.get(product.id) ?? [];
      const bits = [`${product.name} cuesta $${product.price.toFixed(2)}`];
      if (product.description) bits.push(product.description);
      if (ingredients.length) {
        bits.push(`Lleva: ${ingredients.map((i) => i.name).join(", ")}`);
        const allergens = ingredients.filter((i) => i.is_allergen);
        if (allergens.length) bits.push(`Contiene ${allergens.map((i) => i.name).join(", ")}`);
        const modifiable = ingredients.filter((i) => i.is_modifiable);
        if (modifiable.length) bits.push(`Se le puede quitar: ${modifiable.map((i) => i.name).join(", ")}`);
      }
      if (product.prep_time_minutes) bits.push(`Tarda unos ${product.prep_time_minutes} min`);
      return { reply: `${bits.join(". ")}.`, draft, productIds: [product.id] };
    }
    if (RE.alergenos.test(norm)) {
      return {
        reply:
          "No tengo esa información registrada para ese platillo. Con gusto le pregunto a un mesero para estar seguros.",
        draft,
        productIds: [],
      };
    }
  }

  if (RE.menu.test(norm)) {
    const byCategory = ctx.categories
      .map((c) => {
        const items = ctx.products.filter((p) => p.category_id === c.id && p.is_available);
        return items.length ? `${c.name}: ${items.map((p) => p.name).join(", ")}` : null;
      })
      .filter(Boolean);
    if (byCategory.length === 0) return null;
    return { reply: `Esto es lo que tenemos hoy. ${byCategory.join(". ")}.`, draft, productIds: [] };
  }

  // Políticas y notas del restaurante: se busca la entrada que más palabras
  // comparta con la pregunta.
  const askTokens = contentTokens(norm);
  if (askTokens.length >= 2) {
    const entries = [
      ...ctx.knowledge.map((k) => ({ text: `${k.title}: ${k.content}`, haystack: `${k.title} ${k.content}` })),
      ...ctx.policies.map((p) => ({ text: p.content, haystack: p.content })),
    ];
    let best: { text: string; score: number } | null = null;
    for (const entry of entries) {
      const hay = contentTokens(entry.haystack);
      const hits = askTokens.filter((t) => hay.some((h) => similarWord(h, t))).length;
      const score = hits / askTokens.length;
      if (score >= 0.5 && (!best || score > best.score)) best = { text: entry.text, score };
    }
    if (best) return { reply: best.text, draft, productIds: [] };
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Textos                                                                      */
/* -------------------------------------------------------------------------- */

function greeting(ctx: EngineContext): string {
  return pick([
    `¡Hola! Bienvenido a ${ctx.restaurantName}. ¿Qué te sirvo?`,
    `¡Buenas! Estás en ${ctx.tableLabel}. ¿Qué van a querer?`,
    `¡Hola! ¿Te tomo la orden?`,
  ]);
}

function helpText(): string {
  return [
    "Puedes pedirme cosas como:",
    '"quiero dos hamburguesas",',
    '"para la persona 2 una ensalada",',
    '"unas papas para compartir",',
    '"quita la limonada",',
    'o "es todo" cuando quieras cerrar el pedido.',
    "También te digo precios, ingredientes y alérgenos.",
  ].join(" ");
}

function notFound(unmatched: string[], ctx: EngineContext): string {
  const alternatives = searchProducts(unmatched[0], ctx.products, 3);
  if (alternatives.length > 0) {
    return `No tengo "${unmatched[0]}" en la carta. ¿Te interesa ${alternatives
      .map((p) => p.name)
      .join(" o ")}?`;
  }
  return `No encontré "${unmatched[0]}" en el menú. Si quieres te digo qué tenemos disponible.`;
}

/**
 * Solo se usa si la consulta abierta tampoco está disponible: el chat prefiere
 * delegar la duda antes que contestar con un "no entendí".
 */
function notUnderstood(): string {
  return pick([
    'No te entendí bien. Puedes decirme "quiero una hamburguesa" o pedirme el menú.',
    'Perdón, no capté eso. Dime qué te sirvo o escribe "menú" para ver la carta.',
  ]);
}
