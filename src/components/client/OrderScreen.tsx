import { useMemo, useState, type ReactNode } from "react";
import { useCart } from "../../contexts/CartContext";
import { inferCourse } from "../../lib/courses";
import type { AssistantScope } from "../../lib/askAssistant";
import type {
  AiKnowledge,
  Category,
  Ingredient,
  Policy,
  Product,
} from "../../types/database";
import { CartDrawer } from "./CartDrawer";
import { ChatWidget } from "./ChatWidget";
import { ProductCard, type CartAddition } from "./ProductCard";

type Tab = "menu" | "chat";

/**
 * La pantalla del cliente: carta, mesero IA y carrito.
 *
 * La comparten el flujo de mesa (QR) y el de domicilio, que solo se
 * diferencian en cómo se identifica al restaurante y en qué pasa al confirmar.
 */
export function OrderScreen({
  restaurantName,
  contextLabel,
  scope,
  categories,
  products,
  ingredients,
  policies,
  knowledge,
  confirmLabel,
  confirmationMessage,
  submitting,
  onSubmit,
  header,
}: {
  restaurantName: string;
  /** Qué se está atendiendo: "Mesa 4" o "A domicilio". */
  contextLabel: string;
  scope: AssistantScope;
  categories: Category[];
  products: Product[];
  ingredients: Ingredient[];
  policies: Policy[];
  knowledge: AiKnowledge[];
  confirmLabel: string;
  confirmationMessage: string;
  submitting: boolean;
  onSubmit: () => Promise<void>;
  /** Contenido extra bajo la cabecera (el checkout de domicilio). */
  header?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("menu");
  const [cartOpen, setCartOpen] = useState(false);
  const { draft, addLine, removeLine, total } = useCart();

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
    // El tiempo sale de la categoría en la que el restaurante puso el platillo.
    const category = categories.find((c) => c.id === addition.product.category_id);
    addLine({
      product: addition.product,
      quantity: addition.quantity,
      removedIngredients: addition.removedIngredients,
      notes: addition.notes,
      seat: addition.seat,
      course: inferCourse(category?.name ?? ""),
    });
    setCartOpen(true);
  }

  async function confirm() {
    await onSubmit();
    setCartOpen(false);
  }

  return (
    <div className="min-h-screen bg-neutral-50 pb-24">
      <header className="border-b border-neutral-200 bg-white px-4 py-4">
        <h1 className="text-lg font-semibold">{restaurantName}</h1>
        <p className="text-sm text-neutral-500">{contextLabel}</p>
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
            Hablar con el mesero
          </button>
        </div>
        {header}
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
          <ChatWidget
            scope={scope}
            restaurantName={restaurantName}
            tableLabel={contextLabel}
            categories={categories}
            products={products}
            ingredients={ingredients}
            policies={policies}
            knowledge={knowledge}
            onOrder={onSubmit}
            confirmationMessage={confirmationMessage}
          />
        </div>
      )}

      {/* Un solo carrito: da igual si el platillo entró por el menú o por el
          chat, el botón muestra siempre la misma comanda. */}
      {draft.lines.length > 0 && !cartOpen && tab === "menu" && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-6 py-3 text-sm font-medium text-white shadow-lg"
        >
          Ver pedido ({draft.lines.length}) · ${total.toFixed(2)}
        </button>
      )}

      <CartDrawer
        open={cartOpen}
        lines={draft.lines}
        confirming={submitting}
        confirmLabel={confirmLabel}
        onClose={() => setCartOpen(false)}
        onRemove={removeLine}
        onConfirm={confirm}
      />
    </div>
  );
}
