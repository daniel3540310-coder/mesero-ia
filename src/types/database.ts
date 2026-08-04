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
  created_at: string;
}

export interface Category {
  id: string;
  restaurant_id: string;
  name: string;
  sort_order: number;
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

export interface Order {
  id: string;
  restaurant_id: string;
  table_id: string;
  status: OrderStatus;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  removed_ingredients: string[];
  notes: string | null;
}

export type UserRole = "owner" | "restaurant";
