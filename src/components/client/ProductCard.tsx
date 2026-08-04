import { useState } from "react";
import type { Ingredient, Product } from "../../types/database";

export interface CartAddition {
  product: Product;
  quantity: number;
  removedIngredients: string[];
}

export function ProductCard({
  product,
  ingredients,
  onAdd,
}: {
  product: Product;
  ingredients: Ingredient[];
  onAdd: (addition: CartAddition) => void;
}) {
  const [open, setOpen] = useState(false);
  const [removed, setRemoved] = useState<string[]>([]);
  const modifiable = ingredients.filter((i) => i.is_modifiable);
  const allergens = ingredients.filter((i) => i.is_allergen);

  function toggleRemoved(name: string) {
    setRemoved((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  }

  function handleAdd() {
    onAdd({ product, quantity: 1, removedIngredients: removed });
    setRemoved([]);
    setOpen(false);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      {product.image_url && (
        <img src={product.image_url} alt={product.name} className="h-36 w-full object-cover" />
      )}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium">{product.name}</p>
          <p className="whitespace-nowrap font-medium text-brand-700">
            ${product.price.toFixed(2)}
          </p>
        </div>
        {product.description && (
          <p className="mt-1 text-sm text-neutral-500">{product.description}</p>
        )}
        {allergens.length > 0 && (
          <p className="mt-1 text-xs text-amber-700">
            Contiene: {allergens.map((a) => a.name).join(", ")}
          </p>
        )}
        {!open ? (
          <button
            onClick={() => setOpen(true)}
            className="mt-3 w-full rounded-lg bg-brand-600 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Agregar
          </button>
        ) : (
          <div className="mt-3 space-y-2">
            {modifiable.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-600">
                  Quitar ingredientes:
                </p>
                <div className="flex flex-wrap gap-2">
                  {modifiable.map((ing) => (
                    <label
                      key={ing.id}
                      className="flex items-center gap-1 rounded-full border border-neutral-300 px-2 py-1 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={removed.includes(ing.name)}
                        onChange={() => toggleRemoved(ing.name)}
                      />
                      Sin {ing.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 rounded-lg border border-neutral-300 py-1.5 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleAdd}
                className="flex-1 rounded-lg bg-brand-600 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                Confirmar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
