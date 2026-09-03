/** Utilidades de texto compartidas por el motor de comandas. */

/** Minúsculas, sin acentos y sin puntuación, para comparar de forma estable. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean);
}

/**
 * Palabras que no aportan nada al buscar un platillo. Se quitan antes de
 * comparar para que "quiero una de las hamburguesas" pese lo mismo que
 * "hamburguesa".
 */
const STOPWORDS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al",
  "a", "con", "sin", "para", "por", "y", "e", "o", "u", "que", "me", "mi",
  "te", "se", "le", "nos", "es", "son", "esta", "este", "esa", "ese", "eso",
  "quiero", "queremos", "quisiera", "dame", "damos", "ponme", "pon", "traeme",
  "trae", "traiga", "porfa", "favor", "gracias", "please", "orden", "ordenes",
  "plato", "platos", "platillo", "platillos", "pedido", "porcion", "porciones",
]);

export function contentTokens(text: string): string[] {
  return tokens(text).filter((t) => !STOPWORDS.has(t));
}

/** Distancia de edición, acotada para no gastar tiempo en palabras muy distintas. */
export function levenshtein(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      row.push(value);
      if (value < best) best = value;
    }
    if (best > max) return max + 1; // ya no puede bajar del umbral
    prev = row;
  }
  return prev[b.length];
}

/**
 * Dos palabras son "la misma" si coinciden, si una es prefijo de la otra
 * (plurales: hamburguesa / hamburguesas) o si difieren en una letra
 * (erratas y fallos de dictado).
 */
export function similarWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 4 && long.startsWith(short)) return true;
  if (short.length >= 5 && levenshtein(a, b, 1) <= 1) return true;
  return false;
}

/**
 * Parte la frase en trozos pedibles por separado. El dictado no trae comas, así
 * que también se corta por conectores ("y", "también", "además").
 */
export function splitSegments(text: string): string[] {
  return normalize(text)
    .split(/\s*(?:,|;|\by\b|\be\b|\btambien\b|\bademas\b|\bmas\b|\bluego\b|\bdespues\b)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Elige una variante al azar, para que el mesero no conteste siempre igual. */
export function pick<T>(options: T[]): T {
  return options[Math.floor(Math.random() * options.length)];
}
