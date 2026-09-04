import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CartProvider, useCart } from "../../contexts/CartContext";
import { supabase } from "../../lib/supabaseClient";
import { submitOrder } from "../../lib/orders";
import { useRestaurantMenu } from "../../lib/useRestaurantMenu";
import { OrderScreen } from "../../components/client/OrderScreen";
import { AccountPanel, TableClosedScreen } from "../../components/client/AccountPanel";
import { useTableAccount } from "../../lib/useTableAccount";
import type { Restaurant, RestaurantTable } from "../../types/database";

/** Flujo de mesa: el comensal llega escaneando el QR de su mesa. */
export function ClientMenuPage() {
  const { qrToken } = useParams<{ qrToken: string }>();
  const [table, setTable] = useState<RestaurantTable | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadingTable, setLoadingTable] = useState(true);

  useEffect(() => {
    async function load() {
      if (!qrToken) return;
      const { data: tableData } = await supabase
        .from("tables")
        .select("*")
        .eq("qr_token", qrToken)
        .maybeSingle();

      if (!tableData) {
        setNotFound(true);
        setLoadingTable(false);
        return;
      }
      setTable(tableData as RestaurantTable);

      const { data: restaurantData } = await supabase
        .from("restaurants")
        .select("*")
        .eq("id", (tableData as RestaurantTable).restaurant_id)
        .eq("status", "active")
        .maybeSingle();

      if (!restaurantData) setNotFound(true);
      else setRestaurant(restaurantData as Restaurant);
      setLoadingTable(false);
    }
    load();
  }, [qrToken]);

  const menu = useRestaurantMenu(restaurant?.id ?? null);

  if (loadingTable || menu.loading) {
    return <div className="p-8 text-center text-neutral-500">Cargando menú…</div>;
  }

  if (notFound || !restaurant || !table) {
    return (
      <div className="p-8 text-center text-neutral-500">
        No pudimos encontrar esta mesa. Escanea el código QR nuevamente.
      </div>
    );
  }

  return (
    <CartProvider scope={`mesa:${table.id}`} products={menu.products}>
      <TableOrder restaurant={restaurant} table={table} menu={menu} qrToken={qrToken!} />
    </CartProvider>
  );
}

function TableOrder({
  restaurant,
  table,
  menu,
  qrToken,
}: {
  restaurant: Restaurant;
  table: RestaurantTable;
  menu: ReturnType<typeof useRestaurantMenu>;
  qrToken: string;
}) {
  const { draft, clear } = useCart();
  const [submitting, setSubmitting] = useState(false);
  const account = useTableAccount(table.id, menu.products);

  async function handleSubmit() {
    if (draft.lines.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      await submitOrder({
        restaurantId: restaurant.id,
        tableId: table.id,
        lines: draft.lines,
        diners: draft.diners,
      });
      clear();
    } finally {
      setSubmitting(false);
    }
  }

  // El restaurante cobró: la mesa queda libre para el siguiente cliente.
  if (account.closed) {
    return (
      <TableClosedScreen
        restaurantName={restaurant.name}
        reviewUrl={restaurant.google_review_url}
        onRestart={() => {
          clear();
          account.reset();
        }}
      />
    );
  }

  return (
    <OrderScreen
      restaurantName={restaurant.name}
      contextLabel={table.label}
      scope={{ qrToken }}
      categories={menu.categories}
      products={menu.products}
      ingredients={menu.ingredients}
      policies={menu.policies}
      knowledge={menu.knowledge}
      confirmLabel="Ordenar"
      confirmationMessage="¡Listo! Tu pedido ya está en cocina. ¿Te sirvo algo más?"
      submitting={submitting}
      onSubmit={handleSubmit}
      account={<AccountPanel account={account} />}
    />
  );
}
