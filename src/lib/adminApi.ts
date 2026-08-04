import { supabase } from "./supabaseClient";
import type { Restaurant } from "../types/database";

interface CreateRestaurantInput {
  name: string;
  slug: string;
  username: string;
  password: string;
}

interface UpdateRestaurantInput {
  id: string;
  name?: string;
  slug?: string;
}

async function callAdmin<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-restaurants", {
    body,
  });
  if (error) {
    throw new Error(error.message ?? "Error en la operación de administración.");
  }
  return data as T;
}

export function createRestaurant(input: CreateRestaurantInput) {
  return callAdmin<{ restaurant: Restaurant }>({ action: "create", ...input });
}

export function updateRestaurant(input: UpdateRestaurantInput) {
  return callAdmin<{ restaurant: Restaurant }>({ action: "update", ...input });
}

export function suspendRestaurant(id: string) {
  return callAdmin<{ restaurant: Restaurant }>({ action: "suspend", id });
}

export function reactivateRestaurant(id: string) {
  return callAdmin<{ restaurant: Restaurant }>({ action: "reactivate", id });
}

export function deleteRestaurant(id: string) {
  return callAdmin<{ success: true }>({ action: "delete", id });
}
