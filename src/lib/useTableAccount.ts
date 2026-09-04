import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import type { Order, OrderItem, PaymentMethod, Product } from "../types/database";

export interface AccountLine {
  id: string;
  name: string;
  quantity: number;
  price: number;
  seat: number | null;
  notes: string | null;
  removed: string[];
}

export interface TableAccount {
  lines: AccountLine[];
  total: number;
  /** El comensal ya pidió la cuenta y espera al mesero. */
  requested: boolean;
  method: PaymentMethod | null;
  /** El restaurante cobró y cerró la mesa. */
  closed: boolean;
  loading: boolean;
  requestBill: (method: PaymentMethod) => Promise<void>;
  /** Deja la mesa lista para el siguiente cliente. */
  reset: () => void;
}

/**
 * La cuenta de la mesa, en vivo.
 *
 * Lee los pedidos de la mesa —el comensal ya puede, desde la migración 0007— y
 * escucha los cambios, para que la pantalla reaccione sola cuando la caja marca
 * la mesa como pagada.
 */
export function useTableAccount(tableId: string | null, products: Product[]): TableAccount {
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [closed, setClosed] = useState(false);

  // Para saber que la mesa se cerró hay que haber visto antes una cuenta
  // abierta: si no, un cliente que acaba de escanear el QR vería la pantalla de
  // despedida del comensal anterior.
  const hadOpenRef = useRef(false);

  const load = useCallback(async () => {
    if (!tableId) return;

    const { data: rawOrders } = await supabase
      .from("orders")
      .select("*")
      .eq("table_id", tableId)
      .neq("status", "cancelado")
      .order("created_at", { ascending: true });

    const all = (rawOrders as Order[]) ?? [];
    const open = all.filter((o) => o.bill_status !== "pagada");

    if (open.length > 0) hadOpenRef.current = true;
    else if (hadOpenRef.current) setClosed(true);

    setOrders(open);

    if (open.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    const { data: rawItems } = await supabase
      .from("order_items")
      .select("*")
      .in("order_id", open.map((o) => o.id));

    setItems(((rawItems as OrderItem[]) ?? []).filter((i) => i.status !== "cancelado"));
    setLoading(false);
  }, [tableId]);

  useEffect(() => {
    if (!tableId) {
      setLoading(false);
      return;
    }
    load();

    const channel = supabase
      .channel(`account-${tableId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `table_id=eq.${tableId}` },
        () => load()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => load())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tableId, load]);

  const byId = new Map(products.map((p) => [p.id, p]));
  const lines: AccountLine[] = items.map((item) => {
    const product = byId.get(item.product_id);
    return {
      id: item.id,
      name: product?.name ?? "Producto",
      quantity: item.quantity,
      price: product?.price ?? 0,
      seat: item.seat_number,
      notes: item.notes,
      removed: item.removed_ingredients,
    };
  });

  const total = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
  const requested = orders.some((o) => o.bill_status === "solicitada");
  const method = orders.find((o) => o.payment_method)?.payment_method ?? null;

  const requestBill = useCallback(
    async (paymentMethod: PaymentMethod) => {
      if (!tableId) return;
      // Vía función: el comensal no puede actualizar "orders" directamente, o
      // podría también cancelar platillos o darlos por entregados.
      const { error } = await supabase.rpc("request_bill", {
        p_table_id: tableId,
        p_method: paymentMethod,
      });
      if (error) throw error;
      await load();
    },
    [tableId, load]
  );

  const reset = useCallback(() => {
    hadOpenRef.current = false;
    setClosed(false);
    setOrders([]);
    setItems([]);
  }, []);

  return { lines, total, requested, method, closed, loading, requestBill, reset };
}
