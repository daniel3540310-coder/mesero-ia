import type { Product } from "../../types/database";
import { contentTokens, normalize, similarWord } from "./text";

export interface ProductMatch {
  product: Product;
  /** 0 a 1. Cuánto del nombre del platillo aparece en lo que dijo el cliente. */
  score: number;
}

/** Por debajo de esto no se considera que el cliente haya nombrado el platillo. */
const MIN_SCORE = 0.55;

/**
 * Si el mejor y el segundo candidato están así de cerca, no se adivina: se le
 * pregunta al cliente cuál quiso decir. Es lo que hace un mesero de verdad
 * cuando hay dos platillos parecidos en la carta.
 */
const AMBIGUITY_MARGIN = 0.12;

function scoreProduct(product: Product, phraseTokens: string[], phrase: string): number {
  const nameTokens = contentTokens(product.name);
  if (nameTokens.length === 0) return 0;

  // El nombre completo dentro de la frase es la señal más fuerte que hay.
  const normalizedName = normalize(product.name);
  if (normalizedName.length >= 4 && phrase.includes(normalizedName)) return 1;

  let matched = 0;
  for (const nameToken of nameTokens) {
    if (phraseTokens.some((t) => similarWord(t, nameToken))) matched++;
  }
  if (matched === 0) return 0;

  const coverage = matched / nameTokens.length;

  // Un nombre de una sola palabra que además es corta ("wings") acierta
  // demasiado fácil; se le pide coincidencia total para evitar falsos positivos.
  if (nameTokens.length === 1 && nameTokens[0].length <= 4 && coverage < 1) return 0;

  return coverage;
}

export interface MatchResult {
  /** El platillo elegido, si hubo uno claro. */
  match: ProductMatch | null;
  /** Candidatos empatados, cuando hace falta preguntar al cliente. */
  ambiguous: ProductMatch[];
}

/**
 * Busca en la carta del restaurante el platillo que el cliente nombró.
 *
 * Tolera plurales, erratas y palabras de relleno, pero nunca inventa: si nada
 * supera el umbral devuelve vacío, y si hay empate devuelve los candidatos para
 * que el chat pregunte en vez de adivinar.
 */
export function findProduct(phrase: string, products: Product[]): MatchResult {
  const phraseTokens = contentTokens(phrase);
  if (phraseTokens.length === 0) return { match: null, ambiguous: [] };

  const normalizedPhrase = normalize(phrase);

  const scored = products
    .filter((p) => p.is_available)
    .map((product) => ({ product, score: scoreProduct(product, phraseTokens, normalizedPhrase) }))
    .filter((m) => m.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.product.name.length - b.product.name.length);

  if (scored.length === 0) return { match: null, ambiguous: [] };

  const best = scored[0];
  const contenders = scored.filter((m) => best.score - m.score <= AMBIGUITY_MARGIN);

  // Empate real solo si son platillos distintos con puntuación equivalente.
  if (contenders.length > 1 && best.score < 1) {
    return { match: null, ambiguous: contenders.slice(0, 4) };
  }

  return { match: best, ambiguous: [] };
}

/** Búsqueda laxa para responder preguntas ("¿cuánto cuesta la hamburguesa?"). */
export function searchProducts(phrase: string, products: Product[], limit = 5): Product[] {
  const phraseTokens = contentTokens(phrase);
  if (phraseTokens.length === 0) return [];
  const normalizedPhrase = normalize(phrase);

  return products
    .filter((p) => p.is_available)
    .map((product) => ({ product, score: scoreProduct(product, phraseTokens, normalizedPhrase) }))
    .filter((m) => m.score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((m) => m.product);
}
