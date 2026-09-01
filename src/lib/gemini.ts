import type { Course } from "../types/database";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabaseClient";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ProposedOrderItem {
  productId: string;
  quantity: number;
  notes?: string;
  /** Comensal al que va el platillo; ausente si es para compartir. */
  seat?: number;
  course: Course;
}

export interface AssistantReply {
  reply: string;
  productIds: string[];
  orderItems: ProposedOrderItem[];
  /** Comensales en la mesa, si el cliente lo mencionó. */
  diners?: number;
}

export interface AskOptions {
  /** Se llama con cada trozo de texto mientras el asistente escribe. */
  onDelta?: (text: string) => void;
  /** Avisa cuándo empieza cada intento, para poder limpiar lo ya mostrado. */
  onAttempt?: (attempt: number, total: number) => void;
}

/**
 * Mensajes previos que se mandan. El chat de una mesa no necesita memoria
 * larga, y un historial que crece sin límite encarece y ralentiza cada
 * respuesta hasta que empieza a fallar. El servidor vuelve a aplicar el
 * recorte por su cuenta.
 */
const MAX_HISTORY_MESSAGES = 8;

const MAX_ATTEMPTS = 3;
/** Sin recibir un solo byte durante este tiempo, se da la conexión por colgada. */
const STALL_TIMEOUT_MS = 20_000;
const TOTAL_TIMEOUT_MS = 60_000;

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/gemini-chat`;

const FUNCTION_HEADERS = {
  "Content-Type": "application/json",
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

/**
 * Un fallo del asistente. `retryable` distingue lo que puede arreglarse
 * reintentando (red caída, corte a media respuesta, error de Gemini) de lo que
 * no (la mesa no existe, el restaurante está suspendido): reintentar eso último
 * solo haría esperar al cliente para volver a fallar igual.
 */
class AssistantError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "AssistantError";
    this.retryable = retryable;
  }
}

interface RequestPayload {
  qrToken: string;
  message: string;
  history: ChatMessage[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pregunta al asistente del restaurante.
 *
 * El primer intento va por streaming, para que el cliente vea la respuesta
 * aparecer en vez de una pantalla quieta. Si algo se rompe, los reintentos usan
 * la llamada simple, que tiene menos piezas que puedan fallar.
 */
export async function askRestaurantAssistant(
  qrToken: string,
  message: string,
  history: ChatMessage[],
  options: AskOptions = {}
): Promise<AssistantReply> {
  const payload: RequestPayload = {
    qrToken,
    message,
    history: history.slice(-MAX_HISTORY_MESSAGES),
  };

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    options.onAttempt?.(attempt, MAX_ATTEMPTS);
    const useStream = attempt === 1 && typeof options.onDelta === "function";

    try {
      return useStream
        ? await streamRequest(payload, options.onDelta!)
        : await completeRequest(payload);
    } catch (err) {
      lastError = err;
      const retryable = err instanceof AssistantError ? err.retryable : true;
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      await sleep(600 * 2 ** (attempt - 1));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("No se pudo contactar al asistente.");
}

/* -------------------------------------------------------------------------- */

/** Llamada normal: se espera la respuesta completa. */
async function completeRequest(payload: RequestPayload): Promise<AssistantReply> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOTAL_TIMEOUT_MS);

  try {
    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: FUNCTION_HEADERS,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) throw await errorFromResponse(response);

    const data = (await response.json()) as Partial<AssistantReply>;
    return {
      reply: data.reply ?? "",
      productIds: data.productIds ?? [],
      orderItems: data.orderItems ?? [],
      diners: data.diners,
    };
  } catch (err) {
    throw asAssistantError(err);
  } finally {
    clearTimeout(timer);
  }
}

/** Llamada transmitida: el texto va llegando por Server-Sent Events. */
async function streamRequest(
  payload: RequestPayload,
  onDelta: (text: string) => void
): Promise<AssistantReply> {
  const controller = new AbortController();
  const total = setTimeout(() => controller.abort(), TOTAL_TIMEOUT_MS);
  let stall = setTimeout(() => controller.abort(), STALL_TIMEOUT_MS);

  // Cada trozo recibido reinicia el cronómetro: lo que se vigila es el silencio,
  // no lo que tarde una respuesta larga en completarse.
  const resetStall = () => {
    clearTimeout(stall);
    stall = setTimeout(() => controller.abort(), STALL_TIMEOUT_MS);
  };

  try {
    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: FUNCTION_HEADERS,
      body: JSON.stringify({ ...payload, stream: true }),
      signal: controller.signal,
    });

    if (!response.ok) throw await errorFromResponse(response);
    if (!response.body) {
      throw new AssistantError("No se pudo abrir la respuesta del asistente.", true);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: AssistantReply | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetStall();

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const { event, data } = parseSseBlock(block);
        if (!event || !data) continue;

        if (event === "delta") {
          if (typeof data.text === "string") onDelta(data.text);
        } else if (event === "done") {
          result = {
            reply: typeof data.reply === "string" ? data.reply : "",
            productIds: Array.isArray(data.productIds) ? data.productIds : [],
            orderItems: Array.isArray(data.orderItems) ? data.orderItems : [],
            diners: typeof data.diners === "number" ? data.diners : undefined,
          };
        } else if (event === "error") {
          throw new AssistantError(
            typeof data.error === "string" ? data.error : "El asistente falló a media respuesta.",
            true
          );
        }
      }
    }

    if (!result) {
      throw new AssistantError("La respuesta se cortó antes de terminar.", true);
    }
    return result;
  } catch (err) {
    throw asAssistantError(err);
  } finally {
    clearTimeout(total);
    clearTimeout(stall);
  }
}

/* -------------------------------------------------------------------------- */

interface SseData {
  text?: unknown;
  error?: unknown;
  reply?: unknown;
  productIds?: unknown;
  orderItems?: unknown;
  diners?: unknown;
}

function parseSseBlock(block: string): { event: string | null; data: SseData | null } {
  let event: string | null = null;
  const dataLines: string[] = [];

  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }

  if (dataLines.length === 0) return { event, data: null };
  try {
    return { event, data: JSON.parse(dataLines.join("\n")) as SseData };
  } catch {
    return { event, data: null };
  }
}

/** Traduce una respuesta con error de la función a algo que el cliente entienda. */
async function errorFromResponse(response: Response): Promise<AssistantError> {
  const body = await response
    .clone()
    .json()
    .then((parsed: { error?: string; detail?: string }) => parsed)
    .catch(() => undefined);

  // El comensal solo ve el mensaje amable; el detalle técnico (respuesta cruda
  // de Gemini, código de estado) va a la consola para poder diagnosticar.
  if (body?.detail) console.error("Mesero IA — detalle del fallo:", body.detail);

  // 4xx son problemas de la petición (mesa inexistente, restaurante suspendido):
  // reintentar da exactamente el mismo resultado.
  const retryable = response.status >= 500 || response.status === 429;
  return new AssistantError(
    body?.error ?? "No se pudo contactar al asistente.",
    retryable
  );
}

function asAssistantError(err: unknown): AssistantError {
  if (err instanceof AssistantError) return err;
  if (err instanceof DOMException && err.name === "AbortError") {
    return new AssistantError("El asistente tardó demasiado en responder.", true);
  }
  return new AssistantError(
    err instanceof Error ? err.message : "No se pudo contactar al asistente.",
    true
  );
}
