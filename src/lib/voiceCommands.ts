import { findNumber } from "./spanishNumbers";

/**
 * Interpretación de comandos de voz de la cocina.
 *
 * Se mantiene como función pura (sin React ni navegador) porque es la parte
 * más delicada de la función manos libres: un comando mal entendido marca
 * como entregada la comanda equivocada.
 */

export type KitchenVoiceCommand =
  | { action: "entregado"; orderNumber: number }
  | { action: "cancelado"; orderNumber: number }
  // Sin número deshace la última acción; con número revierte esa comanda.
  | { action: "deshacer"; orderNumber?: number };

/** Palabras que el cocinero puede usar para dar una comanda por terminada. */
const DELIVERED_TRIGGERS = [
  "entregado",
  "entregada",
  "entregar",
  "entrega",
  "listo",
  "lista",
  "servido",
  "servida",
  "completado",
  "completada",
  "terminado",
  "terminada",
  "salio",
  "sale",
];

/** Palabras para tirar una comanda que ya no se va a preparar. */
const CANCEL_TRIGGERS = [
  "cancelar",
  "cancela",
  "cancelado",
  "cancelada",
  "anular",
  "anula",
  "anulado",
  "anulada",
];

/**
 * Palabras para revertir. Sin número deshacen la última acción; con número
 * ("deshacer 2") devuelven esa comanda concreta a preparación.
 */
const UNDO_TRIGGERS = ["deshacer", "deshaz", "revertir", "revierte", "reversa"];

/**
 * Palabra de activación: "Mesero". Sin ella no se procesa absolutamente nada:
 * en una cocina se habla todo el tiempo, y sin este filtro cualquier frase
 * suelta ("ya está listo el tres") podría mover una comanda.
 *
 * Al ser una palabra real del español, el dictado la reconoce sin problema (a
 * diferencia de un nombre inventado, que llega escrito de diez formas). A
 * cambio es una palabra que se dice sola en un restaurante, así que el filtro
 * de que vaya AL INICIO y el de exigir acción + número son los que evitan
 * activaciones por accidente.
 */
const WAKE_WORDS = ["mesero", "mesera", "meseros"];

/**
 * Saludos que suelen colarse antes de la palabra clave ("hey mesero", "oye
 * mesero"). Se aceptan varias grafías porque el dictado transcribe "hey" de
 * formas distintas según el acento.
 */
const WAKE_PREFIXES = ["hey", "hei", "ey", "hay", "oye", "oiga", "hola", "ok", "okey", "okay"];

/** Minúsculas, sin acentos y sin puntuación, para comparar de forma estable. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Quita la palabra de activación y devuelve el resto de la frase, o null si la
 * frase no iba dirigida al sistema. Exige que la palabra clave vaya al
 * principio: mencionarla a media conversación no debe activar nada.
 */
function stripWakeWord(words: string[]): string[] | null {
  let i = 0;
  if (words[i] !== undefined && WAKE_PREFIXES.includes(words[i])) i++;

  if (words[i] !== undefined && WAKE_WORDS.includes(words[i])) {
    return words.slice(i + 1);
  }

  return null;
}

/**
 * Si la frase iba dirigida al sistema, aunque el comando no se entienda. Sirve
 * para avisarle al cocinero que sí lo escuchamos pero no comprendimos la orden,
 * en vez de dejarlo hablando sin respuesta.
 */
export function hasWakeWord(transcript: string): boolean {
  return stripWakeWord(normalize(transcript).split(" ").filter(Boolean)) !== null;
}

/**
 * Devuelve el comando reconocido, o null si la frase no es un comando claro.
 *
 * Dos filtros contra el ruido de una cocina:
 *   1. La frase debe empezar con la palabra de activación ("Hey Mesero…").
 *   2. Debe traer acción y número ("listo 3"); "listo" a secas no hace nada.
 */
export function parseKitchenCommand(transcript: string): KitchenVoiceCommand | null {
  // Sin palabra de activación al inicio, la frase se descarta entera.
  const words = stripWakeWord(normalize(transcript).split(" ").filter(Boolean));
  if (words === null || words.length === 0) return null;

  // "deshacer" se revisa primero porque es la única orden que funciona sin
  // número, y porque suele decirse justo después de un comando mal entendido.
  if (words.some((word) => UNDO_TRIGGERS.includes(word))) {
    const target = findNumber(words)?.value ?? null;
    return {
      action: "deshacer",
      orderNumber: target !== null && target >= 1 ? target : undefined,
    };
  }

  const orderNumber = findNumber(words)?.value ?? null;
  if (orderNumber === null || orderNumber < 1) return null;

  // Cancelar antes que entregar: si por alguna razón se colaran las dos
  // palabras, la interpretación conservadora es no dar el platillo por servido.
  if (words.some((word) => CANCEL_TRIGGERS.includes(word))) {
    return { action: "cancelado", orderNumber };
  }
  if (words.some((word) => DELIVERED_TRIGGERS.includes(word))) {
    return { action: "entregado", orderNumber };
  }
  return null;
}
