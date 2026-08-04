import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabaseClient";
import type { Ingredient, Product } from "../../types/database";

interface DraftIngredient {
  id?: string;
  name: string;
  is_modifiable: boolean;
  is_allergen: boolean;
}

export function ProductEditor({
  restaurantId,
  categoryId,
  product,
  onClose,
  onSaved,
}: {
  restaurantId: string;
  categoryId: string;
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [price, setPrice] = useState(product?.price?.toString() ?? "");
  const [prepTime, setPrepTime] = useState(product?.prep_time_minutes?.toString() ?? "");
  const [imageUrl, setImageUrl] = useState(product?.image_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!product) return;
    supabase
      .from("ingredients")
      .select("*")
      .eq("product_id", product.id)
      .then(({ data }) => {
        setIngredients(
          ((data as Ingredient[]) ?? []).map((i) => ({
            id: i.id,
            name: i.name,
            is_modifiable: i.is_modifiable,
            is_allergen: i.is_allergen,
          }))
        );
      });
  }, [product]);

  function addIngredientRow() {
    setIngredients([...ingredients, { name: "", is_modifiable: false, is_allergen: false }]);
  }

  function updateIngredient(index: number, patch: Partial<DraftIngredient>) {
    setIngredients(ingredients.map((ing, i) => (i === index ? { ...ing, ...patch } : ing)));
  }

  function removeIngredient(index: number) {
    setIngredients(ingredients.filter((_, i) => i !== index));
  }

  async function handleImageChange(file: File) {
    setUploading(true);
    setError(null);
    try {
      const path = `${restaurantId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("menu-images")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
      setImageUrl(data.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la imagen.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        restaurant_id: restaurantId,
        category_id: categoryId,
        name,
        description: description || null,
        price: Number(price),
        prep_time_minutes: prepTime ? Number(prepTime) : null,
        image_url: imageUrl || null,
        is_available: true,
      };

      let productId = product?.id;
      if (productId) {
        await supabase.from("products").update(payload).eq("id", productId);
      } else {
        const { data, error: insertError } = await supabase
          .from("products")
          .insert(payload)
          .select()
          .single();
        if (insertError) throw insertError;
        productId = (data as Product).id;
      }

      const validIngredients = ingredients.filter((i) => i.name.trim());
      await supabase.from("ingredients").delete().eq("product_id", productId);
      if (validIngredients.length > 0) {
        await supabase.from("ingredients").insert(
          validIngredients.map((i) => ({
            product_id: productId,
            name: i.name.trim(),
            is_modifiable: i.is_modifiable,
            is_allergen: i.is_allergen,
          }))
        );
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el producto.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-8">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold">
          {product ? "Editar producto" : "Nuevo producto"}
        </h2>

        <div>
          <label className="mb-1 block text-sm font-medium">Nombre</label>
          <input
            required
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Descripción</label>
          <textarea
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Precio</label>
            <input
              required
              type="number"
              step="0.01"
              min="0"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Tiempo prep. (min)
            </label>
            <input
              type="number"
              min="0"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              value={prepTime}
              onChange={(e) => setPrepTime(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Imagen</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && handleImageChange(e.target.files[0])}
          />
          {uploading && <p className="text-sm text-neutral-500">Subiendo…</p>}
          {imageUrl && (
            <img src={imageUrl} alt="" className="mt-2 h-24 w-24 rounded-lg object-cover" />
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium">Ingredientes</label>
            <button
              type="button"
              onClick={addIngredientRow}
              className="text-sm text-brand-600 hover:underline"
            >
              + Agregar ingrediente
            </button>
          </div>
          <div className="space-y-2">
            {ingredients.map((ing, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="flex-1 rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                  placeholder="Nombre"
                  value={ing.name}
                  onChange={(e) => updateIngredient(i, { name: e.target.value })}
                />
                <label className="flex items-center gap-1 text-xs text-neutral-600">
                  <input
                    type="checkbox"
                    checked={ing.is_modifiable}
                    onChange={(e) => updateIngredient(i, { is_modifiable: e.target.checked })}
                  />
                  Modificable
                </label>
                <label className="flex items-center gap-1 text-xs text-neutral-600">
                  <input
                    type="checkbox"
                    checked={ing.is_allergen}
                    onChange={(e) => updateIngredient(i, { is_allergen: e.target.checked })}
                  />
                  Alérgeno
                </label>
                <button
                  type="button"
                  onClick={() => removeIngredient(i)}
                  className="text-red-600"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || uploading}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
