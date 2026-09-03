/**
 * Números escritos en español.
 *
 * Tanto el dictado del cliente como el del cocinero devuelven "tres" y no "3",
 * así que ambos lados necesitan entenderlos. Vive aparte para que la pantalla
 * de cocina y el motor de comandas compartan exactamente la misma lectura.
 */

export const NUMBER_WORDS: Record<string, number> = {
  un: 1, uno: 1, una: 1,
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27,
  veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60,
  setenta: 70, ochenta: 80, noventa: 90,
};

const TENS = new Set([30, 40, 50, 60, 70, 80, 90]);

/**
 * Primer número de la frase, en dígitos ("3") o en palabras ("tres",
 * "treinta y uno"). Devuelve también dónde estaba, porque quien llama suele
 * necesitar quitarlo del texto antes de buscar el platillo.
 */
export function findNumber(words: string[]): { value: number; index: number; length: number } | null {
  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    if (/^\d+$/.test(word)) return { value: Number(word), index: i, length: 1 };

    const value = NUMBER_WORDS[word];
    if (value === undefined) continue;

    // "treinta y uno" y similares: decena + y + unidad.
    if (TENS.has(value) && words[i + 1] === "y") {
      const unit = NUMBER_WORDS[words[i + 2] ?? ""];
      if (unit !== undefined && unit < 10) {
        return { value: value + unit, index: i, length: 3 };
      }
    }
    return { value, index: i, length: 1 };
  }
  return null;
}

/** Igual que findNumber pero cuando solo interesa el valor. */
export function parseSpanishNumber(words: string[]): number | null {
  return findNumber(words)?.value ?? null;
}
