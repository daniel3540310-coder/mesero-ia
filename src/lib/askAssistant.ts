import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabaseClient";
import type { ChatTurn } from "./orderEngine";

/**
 * Consulta de cortesía a Gemini para dudas abiertas.
 *
 * Está deliberadamente aislado del motor de comandas: esta función NUNCA lanza
 * una excepción y NUNCA toca el pedido. Ante cualquier problema —cuota agotada,
 * 503, timeout, sin red, respuesta rara— devuelve null y el chat sigue
 * funcionando con el motor local, que es quien realmente toma la orden.
 */

/** Corto a propósito: es un extra, no puede hacer esperar al comensal. */
const TIMEOUT_MS = 12_000;

export const ASSISTANT_UNAVAILABLE =
  "El asistente de consultas no está disponible en este momento, pero con gusto te ayudo con tu orden. ¿Qué te gustaría pedir?";

export async function askOpenQuestion(
  qrToken: string,
  question: string,
  history: ChatTurn[]
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/gemini-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ qrToken, question, history }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Se registra para poder diagnosticar, pero el comensal no ve nada de esto.
      console.warn("Consulta abierta no disponible:", response.status);
      return null;
    }

    const data = (await response.json()) as { reply?: unknown };
    return typeof data.reply === "string" && data.reply.trim() ? data.reply.trim() : null;
  } catch (err) {
    console.warn("Consulta abierta falló:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
