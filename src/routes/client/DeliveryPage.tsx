import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CartProvider, useCart } from "../../contexts/CartContext";
import { supabase } from "../../lib/supabaseClient";
import { submitOrder, type DeliveryCustomer } from "../../lib/orders";
import { useRestaurantMenu } from "../../lib/useRestaurantMenu";
import { OrderScreen } from "../../components/client/OrderScreen";
import type { Restaurant } from "../../types/database";

/** Pedido a domicilio: se llega por el enlace del restaurante, sin mesa. */
export function DeliveryPage() {
  const { slug } = useParams<{ slug: string }>();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!slug) return;
      // Búsqueda insensible a mayúsculas: los enlaces se comparten a mano y
      // nadie escribe el slug exactamente como está guardado.
      const { data } = await supabase
        .from("restaurants")
        .select("*")
        .ilike("slug", slug)
        .eq("status", "active")
        .maybeSingle();

      if (!data) setNotFound(true);
      else setRestaurant(data as Restaurant);
      setLoading(false);
    }
    load();
  }, [slug]);

  const menu = useRestaurantMenu(restaurant?.id ?? null);

  if (loading || menu.loading) {
    return <div className="p-8 text-center text-neutral-500">Cargando menú…</div>;
  }

  if (notFound || !restaurant) {
    return (
      <div className="p-8 text-center text-neutral-500">
        No encontramos este restaurante. Revisa el enlace.
      </div>
    );
  }

  return (
    <CartProvider scope={`delivery:${restaurant.id}`} products={menu.products}>
      <DeliveryOrder restaurant={restaurant} menu={menu} slug={slug!} />
    </CartProvider>
  );
}

function DeliveryOrder({
  restaurant,
  menu,
  slug,
}: {
  restaurant: Restaurant;
  menu: ReturnType<typeof useRestaurantMenu>;
  slug: string;
}) {
  const { draft, clear } = useCart();
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);

  /**
   * La ubicación es una mejora, nunca un requisito: en interiores el GPS tarda
   * o falla, y el permiso puede estar denegado. Por eso la dirección escrita
   * siempre está disponible y el pedido puede enviarse sin coordenadas.
   */
  function locate() {
    if (!navigator.geolocation) {
      setLocationNote("Tu navegador no permite compartir ubicación. Escribe la dirección.");
      return;
    }
    setLocating(true);
    setLocationNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationNote("Ubicación agregada ✓ El repartidor la abrirá en el mapa.");
        setLocating(false);
      },
      () => {
        setLocationNote("No pudimos obtener tu ubicación. La dirección escrita es suficiente.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  }

  const missing =
    !name.trim() || !phone.trim() || (!address.trim() && !coords);

  async function handleSubmit() {
    if (draft.lines.length === 0 || submitting) return;
    if (missing) {
      setError("Necesitamos tu nombre, teléfono y dónde llevarlo.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const customer: DeliveryCustomer = {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      };
      await submitOrder({ restaurantId: restaurant.id, lines: draft.lines, customer });
      clear();
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el pedido.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <div>
          <h1 className="mb-2 text-2xl font-semibold">¡Pedido enviado!</h1>
          <p className="mb-6 text-neutral-500">
            {restaurant.name} lo está preparando. Te llamarán al {phone} si hace falta.
          </p>
          <button
            onClick={() => setSent(false)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
          >
            Pedir algo más
          </button>
        </div>
      </div>
    );
  }

  return (
    <OrderScreen
      restaurantName={restaurant.name}
      contextLabel="A domicilio"
      scope={{ slug }}
      categories={menu.categories}
      products={menu.products}
      ingredients={menu.ingredients}
      policies={menu.policies}
      knowledge={menu.knowledge}
      confirmLabel="Enviar pedido"
      confirmationMessage="¡Listo! El restaurante ya recibió tu pedido."
      submitting={submitting}
      onSubmit={handleSubmit}
      header={
        <div className="mt-3 space-y-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            ¿A dónde lo llevamos?
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              placeholder="Tu nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              placeholder="Teléfono"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <input
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            placeholder="Dirección (calle, número, referencias)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-100 disabled:opacity-60"
            >
              {locating ? "Buscando…" : coords ? "📍 Actualizar ubicación" : "📍 Usar mi ubicación"}
            </button>
            {locationNote && <span className="text-xs text-neutral-500">{locationNote}</span>}
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      }
    />
  );
}
