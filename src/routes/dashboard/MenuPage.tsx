import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../contexts/AuthContext";
import type { Category, Product, Station } from "../../types/database";
import { STATION_LABELS } from "../../types/database";
import { ProductEditor } from "../../components/menu/ProductEditor";

export function MenuPage() {
  const { restaurant } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingProduct, setEditingProduct] = useState<Product | "new" | null>(null);
  const [activeCategoryForNew, setActiveCategoryForNew] = useState<string | null>(null);

  async function load() {
    if (!restaurant) return;
    const [{ data: cats }, { data: prods }] = await Promise.all([
      supabase
        .from("categories")
        .select("*")
        .eq("restaurant_id", restaurant.id)
        .order("sort_order"),
      supabase.from("products").select("*").eq("restaurant_id", restaurant.id),
    ]);
    setCategories((cats as Category[]) ?? []);
    setProducts((prods as Product[]) ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id]);

  async function addCategory() {
    if (!restaurant || !newCategoryName.trim()) return;
    await supabase.from("categories").insert({
      restaurant_id: restaurant.id,
      name: newCategoryName.trim(),
      sort_order: categories.length,
    });
    setNewCategoryName("");
    await load();
  }

  async function setCategoryStation(id: string, station: Station) {
    await supabase.from("categories").update({ station }).eq("id", id);
    await load();
  }

  async function deleteCategory(id: string) {
    if (!confirm("¿Eliminar categoría y todos sus productos?")) return;
    await supabase.from("categories").delete().eq("id", id);
    await load();
  }

  async function deleteProduct(id: string) {
    if (!confirm("¿Eliminar este producto?")) return;
    await supabase.from("products").delete().eq("id", id);
    await load();
  }

  if (!restaurant) return null;

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">Menú</h2>

      <div className="mb-6 flex gap-2">
        <input
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          placeholder="Nueva categoría (ej. Entradas)"
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
        />
        <button
          onClick={addCategory}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Agregar categoría
        </button>
      </div>

      <div className="space-y-6">
        {categories.map((cat) => (
          <div key={cat.id} className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">{cat.name}</h3>
                {/* La estación se define por categoría porque es como el
                    restaurante ya organiza su carta; la cocina y la barra
                    filtran sus comandas con esto. */}
                <select
                  value={cat.station}
                  onChange={(e) => setCategoryStation(cat.id, e.target.value as Station)}
                  title="Quién prepara esta categoría"
                  className="rounded-lg border border-neutral-300 px-2 py-1 text-xs"
                >
                  <option value="kitchen">{STATION_LABELS.kitchen}</option>
                  <option value="bar">{STATION_LABELS.bar}</option>
                </select>
              </div>
              <div className="flex gap-3 text-sm">
                <button
                  onClick={() => {
                    setActiveCategoryForNew(cat.id);
                    setEditingProduct("new");
                  }}
                  className="text-brand-600 hover:underline"
                >
                  + Producto
                </button>
                <button
                  onClick={() => deleteCategory(cat.id)}
                  className="text-red-600 hover:underline"
                >
                  Eliminar categoría
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {products
                .filter((p) => p.category_id === cat.id)
                .map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border border-neutral-100 p-3"
                  >
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-sm text-neutral-500">${p.price.toFixed(2)}</p>
                    </div>
                    <div className="flex gap-2 text-sm">
                      <button
                        onClick={() => setEditingProduct(p)}
                        className="text-brand-600 hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => deleteProduct(p.id)}
                        className="text-red-600 hover:underline"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              {products.filter((p) => p.category_id === cat.id).length === 0 && (
                <p className="text-sm text-neutral-400">Sin productos todavía.</p>
              )}
            </div>
          </div>
        ))}
        {categories.length === 0 && (
          <p className="text-neutral-500">Crea tu primera categoría para empezar.</p>
        )}
      </div>

      {editingProduct && (
        <ProductEditor
          restaurantId={restaurant.id}
          categoryId={
            editingProduct === "new" ? activeCategoryForNew! : editingProduct.category_id
          }
          product={editingProduct === "new" ? null : editingProduct}
          onClose={() => setEditingProduct(null)}
          onSaved={async () => {
            setEditingProduct(null);
            await load();
          }}
        />
      )}
    </div>
  );
}
