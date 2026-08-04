import type { CartAddition } from "./ProductCard";

export interface CartLine extends CartAddition {
  key: string;
}

export function CartDrawer({
  open,
  lines,
  onClose,
  onRemove,
  onConfirm,
  confirming,
}: {
  open: boolean;
  lines: CartLine[];
  onClose: () => void;
  onRemove: (key: string) => void;
  onConfirm: () => void;
  confirming: boolean;
}) {
  if (!open) return null;

  const total = lines.reduce((sum, l) => sum + l.product.price * l.quantity, 0);

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/40">
      <div className="flex h-full w-full max-w-sm flex-col bg-white">
        <div className="flex items-center justify-between border-b border-neutral-200 p-4">
          <h2 className="font-semibold">Tu pedido</h2>
          <button onClick={onClose} className="text-neutral-500">
            ✕
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {lines.length === 0 && (
            <p className="text-sm text-neutral-400">Aún no has agregado nada.</p>
          )}
          {lines.map((line) => (
            <div key={line.key} className="flex items-start justify-between gap-2 border-b border-neutral-100 pb-3">
              <div>
                <p className="text-sm font-medium">
                  {line.quantity}x {line.product.name}
                </p>
                {line.removedIngredients.length > 0 && (
                  <p className="text-xs text-neutral-500">
                    Sin {line.removedIngredients.join(", ")}
                  </p>
                )}
                <p className="text-xs text-neutral-500">
                  ${(line.product.price * line.quantity).toFixed(2)}
                </p>
              </div>
              <button
                onClick={() => onRemove(line.key)}
                className="text-xs text-red-600 hover:underline"
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
        <div className="border-t border-neutral-200 p-4">
          <div className="mb-3 flex items-center justify-between font-medium">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
          <button
            onClick={onConfirm}
            disabled={lines.length === 0 || confirming}
            className="w-full rounded-lg bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {confirming ? "Enviando…" : "Confirmar pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}
