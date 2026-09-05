import { useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../contexts/AuthContext";
import { DeliverySettings } from "../../components/dashboard/DeliverySettings";

export function InfoPage() {
  const { restaurant, refreshRestaurant } = useAuth();
  const [description, setDescription] = useState(restaurant?.description ?? "");
  const [phone, setPhone] = useState(restaurant?.phone ?? "");
  const [address, setAddress] = useState(restaurant?.address ?? "");
  const [reviewUrl, setReviewUrl] = useState(restaurant?.google_review_url ?? "");
  const [deliveryEnabled, setDeliveryEnabled] = useState(restaurant?.delivery_enabled ?? true);
  const [deliveryPhone, setDeliveryPhone] = useState(restaurant?.delivery_phone ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!restaurant) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    await supabase
      .from("restaurants")
      .update({
        description,
        phone,
        address,
        google_review_url: reviewUrl || null,
        delivery_enabled: deliveryEnabled,
        delivery_phone: deliveryPhone || null,
      })
      .eq("id", restaurant!.id);
    await refreshRestaurant();
    setSaving(false);
    setSaved(true);
  }

  return (
    <div className="max-w-xl">
      <h2 className="mb-4 text-xl font-semibold">Información del restaurante</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
          <div>
            <label className="mb-1 block text-sm font-medium">Descripción</label>
            <textarea
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Cuéntale a tus clientes (y al mesero digital) quiénes son."
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Teléfono</label>
            <input
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Dirección</label>
            <input
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Enlace de reseñas de Google</label>
            <input
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              value={reviewUrl}
              onChange={(e) => setReviewUrl(e.target.value)}
              placeholder="https://g.page/r/..."
            />
            <p className="mt-1 text-xs text-neutral-500">
              Se le muestra al cliente al cerrar su mesa. Búscalo en tu perfil de Google
              Business, en “Pedir reseñas”.
            </p>
          </div>
        </div>

        <DeliverySettings
          restaurant={restaurant}
          enabled={deliveryEnabled}
          phone={deliveryPhone}
          onEnabledChange={setDeliveryEnabled}
          onPhoneChange={setDeliveryPhone}
        />

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
          {saved && <span className="text-sm text-green-600">Guardado.</span>}
        </div>
      </form>
    </div>
  );
}
