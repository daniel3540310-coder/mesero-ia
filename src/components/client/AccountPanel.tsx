import { useState } from "react";
import type { PaymentMethod } from "../../types/database";
import { PAYMENT_LABELS } from "../../types/database";
import type { TableAccount } from "../../lib/useTableAccount";

/** Lo consumido en la mesa y el cobro. */
export function AccountPanel({ account }: { account: TableAccount }) {
  const [sending, setSending] = useState<PaymentMethod | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(method: PaymentMethod) {
    setSending(method);
    setError(null);
    try {
      await account.requestBill(method);
    } catch {
      setError("No pudimos avisar al mesero. Inténtalo de nuevo o llámalo.");
    } finally {
      setSending(null);
    }
  }

  if (account.loading) {
    return <p className="p-4 text-center text-sm text-neutral-500">Cargando tu cuenta…</p>;
  }

  if (account.lines.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-neutral-500">
        Todavía no has consumido nada. Cuando pidas algo aparecerá aquí.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="rounded-xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-100 px-4 py-3">
          <h2 className="font-semibold">Tu consumo</h2>
        </div>
        <ul className="divide-y divide-neutral-100">
          {account.lines.map((line) => (
            <li key={line.id} className="flex items-start justify-between gap-3 px-4 py-2 text-sm">
              <div>
                <p>
                  {line.quantity}x {line.name}
                </p>
                <p className="text-xs text-neutral-500">
                  {line.seat ? `Comensal ${line.seat}` : "Para compartir"}
                  {line.removed.length > 0 && ` · sin ${line.removed.join(", ")}`}
                  {line.notes && ` · ${line.notes}`}
                </p>
              </div>
              <span className="whitespace-nowrap font-medium">
                ${(line.price * line.quantity).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-neutral-200 px-4 py-3 text-base font-semibold">
          <span>Total</span>
          <span>${account.total.toFixed(2)}</span>
        </div>
      </div>

      {account.requested ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
          <p className="font-medium text-green-800">Ya avisamos al mesero 🙌</p>
          <p className="mt-1 text-sm text-green-700">
            Va en camino con la cuenta
            {account.method ? ` para cobrar con ${PAYMENT_LABELS[account.method].toLowerCase()}` : ""}.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="mb-1 font-medium">¿Todo listo?</p>
          <p className="mb-3 text-sm text-neutral-500">
            Dinos cómo vas a pagar y le avisamos al mesero. Si es con tarjeta, lleva la terminal.
          </p>
          <div className="flex gap-2">
            {(["efectivo", "tarjeta"] as PaymentMethod[]).map((method) => (
              <button
                key={method}
                onClick={() => ask(method)}
                disabled={sending !== null}
                className="flex-1 rounded-lg bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {sending === method ? "Avisando…" : `Pedir la cuenta · ${PAYMENT_LABELS[method]}`}
              </button>
            ))}
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

/** Despedida tras el cobro, con la invitación a reseñar. */
export function TableClosedScreen({
  restaurantName,
  reviewUrl,
  onRestart,
}: {
  restaurantName: string;
  reviewUrl: string | null;
  onRestart: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm text-center">
        <p className="text-4xl">🙏</p>
        <h1 className="mt-3 text-2xl font-semibold">¡Gracias por tu visita!</h1>
        <p className="mt-2 text-neutral-500">
          Tu cuenta en {restaurantName} quedó saldada. Esperamos verte pronto.
        </p>

        {reviewUrl && (
          <a
            href={reviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 block rounded-xl border-2 border-amber-300 bg-amber-50 p-4 transition hover:bg-amber-100"
          >
            <p className="text-2xl">⭐️⭐️⭐️⭐️⭐️</p>
            <p className="mt-2 font-semibold text-amber-900">¿Qué te pareció el servicio?</p>
            <p className="mt-1 text-sm text-amber-800">Déjanos tu reseña en Google</p>
          </a>
        )}

        <button
          onClick={onRestart}
          className="mt-6 text-sm text-neutral-500 underline hover:text-neutral-700"
        >
          Empezar un pedido nuevo
        </button>
      </div>
    </div>
  );
}
