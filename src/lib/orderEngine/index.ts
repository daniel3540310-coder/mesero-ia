/**
 * Motor de comandas determinista.
 *
 * Sustituye a la llamada a Gemini: todo se resuelve en el navegador con el menú
 * y las reglas que cargó el restaurante. Respuesta inmediata, sin costo por
 * mensaje, sin cuotas que se agoten y sin posibilidad de que invente platillos.
 */
export { processTurn, emptyDraft, summarize } from "./engine";
export type { OrderDraft, DraftLine, EngineContext, TurnResult, ChatTurn } from "./engine";
export { findProduct, searchProducts } from "./match";
