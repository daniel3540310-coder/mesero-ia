/**
 * Interpretación de comandos de voz de la cocina.
 *
 * Se mantiene como función pura (sin React ni navegador) porque es la parte
 * más delicada de la función manos libres: un comando mal entendido marca
 * como entregada la comanda equivocada.
 */

export interface KitchenVoiceCommand {
  action: "entregado";
  orderNumber: number;
}

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

/**
 * El dictado en español casi nunca devuelve dígitos ("listo tres", no
 * "listo 3"), así que hay que entender también los números escritos.
 */
const NUMBER_WORDS: Record<string, number> = {
  uno: 1, una: 1, un: 1,
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
 * Extrae el primer número de la frase, ya venga en dígitos ("3") o en palabras
 * ("tres", "treinta y uno").
 */
function extractNumber(words: string[]): number | null {
  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    if (/^\d+$/.test(word)) return Number(word);

    const value = NUMBER_WORDS[word];
    if (value === undefined) continue;

    // "treinta y uno" y similares: decena + y + unidad.
    if (TENS.has(value) && words[i + 1] === "y") {
      const unit = NUMBER_WORDS[words[i + 2] ?? ""];
      if (unit !== undefined && unit < 10) return value + unit;
    }
    return value;
  }
  return null;
}

/**
 * Devuelve el comando reconocido, o null si la frase no es un comando claro.
 *
 * Exige que aparezcan las dos partes (acción y número) para no marcar nada por
 * una conversación de cocina captada por accidente: "ya está listo" sin número
 * no hace nada.
 */
export function parseKitchenCommand(transcript: string): KitchenVoiceCommand | null {
  const words = normalize(transcript).split(" ").filter(Boolean);
  if (words.length === 0) return null;

  const hasTrigger = words.some((word) => DELIVERED_TRIGGERS.includes(word));
  if (!hasTrigger) return null;

  const orderNumber = extractNumber(words);
  if (orderNumber === null || orderNumber < 1) return null;

  return { action: "entregado", orderNumber };
}
