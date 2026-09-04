export type RestaurantStatus = "active" | "suspended";

export interface Restaurant {
  id: string;
  auth_user_id: string;
  name: string;
  slug: string;
  description: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  status: RestaurantStatus;
  /** WhatsApp del repartidor. Vacío = el despacho abre el selector de contactos. */
  courier_phone: string | null;
  created_at: string;
}

/** Puesto que prepara el platillo. */
export type Station = "kitchen" | "bar";

export const STATION_LABELS: Record<Station, string> = {
  kitchen: "Cocina",
  bar: "Barra",
};

export interface Category {
  id: string;
  restaurant_id: string;
  name: string;
  sort_order: number;
  station: Station;
}

export interface Product {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  prep_time_minutes: number | null;
  is_available: boolean;
  /** Excepción a la estación de su categoría; null = hereda de ella. */
  station: Station | null;
}

export interface Ingredient {
  id: string;
  product_id: string;
  name: string;
  is_modifiable: boolean;
  is_allergen: boolean;
}

export interface Policy {
  id: string;
  restaurant_id: string;
  content: string;
  sort_order: number;
}

export type AiKnowledgeCategory =
  | "historia"
  | "platillo_estrella"
  | "promocion"
  | "horario"
  | "faq"
  | "recomendacion"
  | "restriccion"
  | "info";

export interface AiKnowledge {
  id: string;
  restaurant_id: string;
  category: AiKnowledgeCategory;
  title: string;
  content: string;
}

export interface RestaurantTable {
  id: string;
  restaurant_id: string;
  label: string;
  qr_token: string;
}

export type OrderStatus = "pendiente" | "entregado" | "cancelado";

/** Tiempo de la comida al que pertenece un platillo. */
export type Course = "bebida" | "entrada" | "fuerte" | "postre";

/** En el orden en que la cocina debe sacarlos. */
export const COURSE_ORDER: Course[] = ["bebida", "entrada", "fuerte", "postre"];

export const COURSE_LABELS: Record<Course, string> = {
  bebida: "Bebidas",
  entrada: "Entradas",
  fuerte: "Plato fuerte",
  postre: "Postres",
};

export type OrderType = "mesa" | "delivery";

export interface Order {
  id: string;
  restaurant_id: string;
  order_type: OrderType;
  /** null en pedidos a domicilio. */
  table_id: string | null;
  status: OrderStatus;
  /** Cuántos comensales hay en la mesa; null si no se indicó. */
  diners: number | null;
  // Datos del cliente a domicilio (null en pedidos de mesa).
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  customer_lat: number | null;
  customer_lng: number | null;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  removed_ingredients: string[];
  notes: string | null;
  /** Para qué comensal es. null = para compartir en la mesa. */
  seat_number: number | null;
  course: Course;
  /**
   * Estado propio del platillo: barra y cocina cierran lo suyo por separado.
   * El estado del pedido se recalcula solo a partir de estos (trigger en BD).
   */
  status: OrderStatus;
}

export type UserRole = "owner" | "restaurant";
