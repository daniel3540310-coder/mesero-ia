import { COURSE_LABELS, COURSE_ORDER } from "../../types/database";
import type { DraftLine } from "../../lib/orderEngine";

/**
 * El pedido en curso, agrupado por tiempo y con el comensal de cada platillo.
 *
 * Muestra exactamente el mismo borrador que alimenta el chat: hay una sola
 * comanda, entre por donde entre.
 */
export function CartDrawer({
  open,
  lines,
  confirming,
  confirmLabel = "Ordenar",
  onClose,
  onRemove,
  onConfirm,
}: {
  open: boolean;
  lines: DraftLine[];
  confirming: boolean;
  confirmLabel?: string;
  onClose: () => void;
  onRemove: (key: string) => void;
  onConfirm: () => void;
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
          {COURSE_ORDER.filter((course) => lines.some((l) => l.course === course)).map((course) => (
            <div key={course}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {COURSE_LABELS[course]}
              </p>
              {lines
                .filter((l) => l.course === course)
                .map((line) => (
                  <div
                    key={line.key}
                    className="flex items-start justify-between gap-2 border-b border-neutral-100 pb-3"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {line.quantity}x {line.product.name}
                      </p>
                      <p className="text-xs text-brand-700">
                        {line.seat ? `Comensal ${line.seat}` : "Para compartir"}
                      </p>
                      {line.removedIngredients.length > 0 && (
                        <p className="text-xs text-neutral-500">
                          Sin {line.removedIngredients.join(", ")}
                        </p>
                      )}
                      {line.notes && <p className="text-xs text-neutral-500">Nota: {line.notes}</p>}
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
            {confirming ? "Enviando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
