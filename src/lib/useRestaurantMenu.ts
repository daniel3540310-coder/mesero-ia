import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import type {
  AiKnowledge,
  Category,
  Ingredient,
  Policy,
  Product,
  Restaurant,
} from "../types/database";

export interface RestaurantMenu {
  restaurant: Restaurant | null;
  categories: Category[];
  products: Product[];
  ingredients: Ingredient[];
  policies: Policy[];
  knowledge: AiKnowledge[];
}

const EMPTY: RestaurantMenu = {
  restaurant: null,
  categories: [],
  products: [],
  ingredients: [],
  policies: [],
  knowledge: [],
};

/**
 * Carga todo lo que el cliente necesita para pedir: carta, ingredientes y las
 * reglas del restaurante, que es lo que alimenta al motor de comandas.
 *
 * Lo usan igual la pantalla de mesa y la de domicilio; solo cambia cómo se
 * localiza el restaurante.
 */
export function useRestaurantMenu(restaurantId: string | null) {
  const [menu, setMenu] = useState<RestaurantMenu>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!restaurantId) {
        setMenu(EMPTY);
        setLoading(false);
        return;
      }
      setLoading(true);

      const [{ data: cats }, { data: prods }, { data: pols }, { data: know }] = await Promise.all([
        supabase.from("categories").select("*").eq("restaurant_id", restaurantId).order("sort_order"),
        supabase
          .from("products")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .eq("is_available", true),
        supabase.from("policies").select("*").eq("restaurant_id", restaurantId).order("sort_order"),
        supabase.from("ai_knowledge").select("*").eq("restaurant_id", restaurantId),
      ]);

      const products = (prods as Product[]) ?? [];
      let ingredients: Ingredient[] = [];
      if (products.length > 0) {
        const { data: ings } = await supabase
          .from("ingredients")
          .select("*")
          .in("product_id", products.map((p) => p.id));
        ingredients = (ings as Ingredient[]) ?? [];
      }

      if (cancelled) return;
      setMenu({
        restaurant: null,
        categories: (cats as Category[]) ?? [],
        products,
        ingredients,
        policies: (pols as Policy[]) ?? [],
        knowledge: (know as AiKnowledge[]) ?? [],
      });
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  return { ...menu, loading };
}
