import type { Course } from "../types/database";

/**
 * Deduce el tiempo de un platillo a partir del nombre de su categoría,
 * aprovechando la organización que el propio restaurante le dio a su menú.
 *
 * Ojo: la Edge Function tiene una copia de esta lógica. No se puede importar
 * de aquí porque corre en Deno, fuera del bundle del navegador; si se cambian
 * las palabras clave, hay que tocar los dos lados.
 */
export function inferCourse(categoryName: string): Course {
  const name = categoryName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (/bebida|refresco|coctel|cocktail|mocktail|cerveza|beer|vino|wine|jugo|juice|cafe|coffee|licor|trago|agua|water|smoothie|drink|bar|agave|mezcal|tequila|burbuja|champagne|soda|mixolog|mezcalita|margarita|bebidas|barra|refrescos/.test(name)) {
    return "bebida";
  }
  if (/entrada|aperitivo|botana|snack|ensalada|salad|sopa|soup|crema|appetizer|starter|compartir|share|share/.test(name)) return "entrada";
  if (/postre|dulce|helado|pastel|dessert|sweet|ice cream/.test(name)) return "postre";
  return "fuerte";
}
