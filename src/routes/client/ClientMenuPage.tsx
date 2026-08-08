import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import type {
  Category,
  Ingredient,
  Product,
  Restaurant,
  RestaurantTable,
} from "../../types/database";
import { ProductCard, type CartAddition } from "../../components/client/ProductCard";
import { CartDrawer, type CartLine } from "../../components/client/CartDrawer";
import { ChatWidget } from "../../components/client/ChatWidget";

type Tab = "menu" | "chat";

export function ClientMenuPage() {
  const { qrToken } = useParams<{ qrToken: string }>();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [table, setTable] = useState<RestaurantTable | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [tab, setTab] = useState<Tab>("menu");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    async function load() {
      if (!qrToken) return;
      const { data: tableData } = await supabase
        .from("tables")
        .select("*")
        .eq("qr_token", qrToken)
        .maybeSingle();

      if (!tableData) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setTable(tableData as RestaurantTable);

      const { data: restaurantData } = await supabase
        .from("restaurants")
        .select("*")
        .eq("id", (tableData as RestaurantTable).restaurant_id)
        .eq("status", "active")
        .maybeSingle();

      if (!restaurantData) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setRestaurant(restaurantData as Restaurant);

      const [{ data: cats }, { data: prods }] = await Promise.all([
        supabase
          .from("categories")
          .select("*")
          .eq("restaurant_id", (restaurantData as Restaurant).id)
          .order("sort_order"),
        supabase
          .from("products")
          .select("*")
          .eq("restaurant_id", (restaurantData as Restaurant).id)
          .eq("is_available", true),
      ]);
      setCategories((cats as Category[]) ?? []);
      const productList = (prods as Product[]) ?? [];
      setProducts(productList);

      if (productList.length > 0) {
        const { data: ings } = await supabase
          .from("ingredients")
          .select("*")
          .in("product_id", productList.map((p) => p.id));
        setIngredients((ings as Ingredient[]) ?? []);
      }

      setLoading(false);
    }
    load();
  }, [qrToken]);

  const ingredientsByProduct = useMemo(() => {
    const map = new Map<string, Ingredient[]>();
    for (const ing of ingredients) {
      const list = map.get(ing.product_id) ?? [];
      list.push(ing);
      map.set(ing.product_id, list);
    }
    return map;
  }, [ingredients]);

  function handleAdd(addition: CartAddition) {
    setCart((prev) => [
      ...prev,
      { ...addition, key: `${addition.product.id}-${Date.now()}` },
    ]);
    setCartOpen(true);
  }

  function handleRemove(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }

  async function handleConfirmOrder() {
    if (!restaurant || !table || cart.length === 0) return;
    setConfirming(true);
    try {
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({ restaurant_id: restaurant.id, table_id: table.id, status: "pendiente" })
        .select()
        .single();
      if (orderError) throw orderError;

      await supabase.from("order_items").insert(
        cart.map((line) => ({
          order_id: order.id,
          product_id: line.product.id,
          quantity: line.quantity,
          removed_ingredients: line.removedIngredients,
          notes: line.notes || null,
        }))
      );

      setCart([]);
      setCartOpen(false);
      setConfirmed(true);
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-neutral-500">Cargando menú…</div>;
  }

  if (notFound || !restaurant || !table) {
    return (
      <div className="p-8 text-center text-neutral-500">
        No pudimos encontrar esta mesa. Escanea el código QR nuevamente.
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <div>
          <h1 className="mb-2 text-2xl font-semibold">¡Pedido enviado!</h1>
          <p className="mb-6 text-neutral-500">
            Tu pedido llegó a {restaurant.name}. Un mesero lo confirmará en breve.
          </p>
          <button
            onClick={() => setConfirmed(false)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
          >
            Volver al menú
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 pb-24">
      <header className="border-b border-neutral-200 bg-white px-4 py-4">
        <h1 className="text-lg font-semibold">{restaurant.name}</h1>
        <p className="text-sm text-neutral-500">{table.label}</p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setTab("menu")}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              tab === "menu" ? "bg-brand-600 text-white" : "bg-neutral-100 text-neutral-600"
            }`}
          >
            Menú
          </button>
          <button
            onClick={() => setTab("chat")}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              tab === "chat" ? "bg-brand-600 text-white" : "bg-neutral-100 text-neutral-600"
            }`}
          >
            Hablar con la IA
          </button>
        </div>
      </header>

      {tab === "menu" ? (
        <div className="mx-auto max-w-3xl space-y-6 p-4">
          {categories.map((cat) => {
            const catProducts = products.filter((p) => p.category_id === cat.id);
            if (catProducts.length === 0) return null;
            return (
              <div key={cat.id}>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                  {cat.name}
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {catProducts.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      ingredients={ingredientsByProduct.get(p.id) ?? []}
                      onAdd={handleAdd}
                    />
                  ))}
                </div>
              </div>
            );
          })}
          {products.length === 0 && (
            <p className="text-center text-neutral-500">
              Este restaurante aún no ha publicado su menú.
            </p>
          )}
        </div>
      ) : (
        <div className="mx-auto h-[70vh] max-w-2xl">
          <ChatWidget qrToken={qrToken!} products={products} />
        </div>
      )}

      {cart.length > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-6 py-3 text-sm font-medium text-white shadow-lg"
        >
          Ver pedido ({cart.length})
        </button>
      )}

      <CartDrawer
        open={cartOpen}
        lines={cart}
        onClose={() => setCartOpen(false)}
        onRemove={handleRemove}
        onConfirm={handleConfirmOrder}
        confirming={confirming}
      />
    </div>
  );
}
