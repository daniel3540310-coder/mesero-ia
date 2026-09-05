import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import type { Restaurant } from "../../types/database";

/**
 * La URL pública de pedidos a domicilio.
 *
 * Se arma con el origen actual para que el enlace que se copie sea el mismo
 * dominio desde el que el restaurante está trabajando: si lo generara con un
 * dominio fijo, los QR impresos apuntarían al lugar equivocado.
 */
export function deliveryUrl(slug: string): string {
  return `${window.location.origin}/delivery/${slug}`;
}

/** Configuración del servicio a domicilio, con su enlace y su QR. */
export function DeliverySettings({
  restaurant,
  enabled,
  phone,
  onEnabledChange,
  onPhoneChange,
}: {
  restaurant: Restaurant;
  enabled: boolean;
  phone: string;
  onEnabledChange: (value: boolean) => void;
  onPhoneChange: (value: string) => void;
}) {
  const qrRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const url = deliveryUrl(restaurant.slug);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles el enlace sigue visible para copiarlo a mano.
    }
  }

  function downloadQr() {
    const canvas = qrRef.current?.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `qr-domicilio-${restaurant.slug}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">Servicio a domicilio</h3>
          <p className="text-sm text-neutral-500">
            Un enlace propio para que te pidan sin estar en el local.
          </p>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm font-medium">{enabled ? "Activo" : "Apagado"}</span>
        </label>
      </div>

      {!enabled && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Con el domicilio apagado, quien abra tu enlace verá un aviso de que por ahora
          solo atiendes en el local. Los pedidos de mesa no se ven afectados.
        </p>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium">
          WhatsApp para despacho / repartidor
        </label>
        <input
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          placeholder="Ej. 6241234567"
        />
        <p className="mt-1 text-xs text-neutral-500">
          A quién le llega el pedido con un toque desde la pantalla de comandas. Si lo dejas
          vacío, WhatsApp te dejará elegir el contacto en el momento.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Tu enlace de pedidos</label>
        <div className="flex flex-wrap items-center gap-2">
          <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-neutral-100 px-3 py-2 text-xs">
            {url}
          </code>
          <button
            type="button"
            onClick={copyUrl}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-medium hover:bg-neutral-100"
          >
            {copied ? "¡Copiado!" : "Copiar"}
          </button>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          Compártelo en tus redes o en tu perfil de Google. Va directo a tu carta.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div ref={qrRef} className="rounded-lg border border-neutral-200 bg-white p-2">
          <QRCodeCanvas value={url} size={112} />
        </div>
        <div>
          <p className="text-sm font-medium">Código QR para domicilio</p>
          <p className="mb-2 text-xs text-neutral-500">
            Para volantes, empaques o el mostrador. No es el de ninguna mesa: quien lo escanee
            pide para llevar.
          </p>
          <button
            type="button"
            onClick={downloadQr}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
          >
            Descargar QR
          </button>
        </div>
      </div>
    </div>
  );
}
