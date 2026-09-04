import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { emptyDraft, type DraftLine, type OrderDraft } from "../lib/orderEngine";
import type { Product } from "../types/database";

/**
 * La comanda en curso, compartida por el menú manual y el mesero IA.
 *
 * Antes cada uno llevaba su propio borrador: si el cliente pedía la hamburguesa
 * por chat y la bebida tocando el menú, acababa con dos pedidos a medias y
 * ninguno completo. Aquí hay uno solo, y da igual por dónde entren los
 * platillos.
 */
interface CartValue {
  draft: OrderDraft;
  /** El motor devuelve el borrador completo tras cada frase. */
  setDraft: (draft: OrderDraft) => void;
  addLine: (line: Omit<DraftLine, "key">) => void;
  removeLine: (key: string) => void;
  setDiners: (diners: number | null) => void;
  clear: () => void;
  total: number;
}

const CartContext = createContext<CartValue | undefined>(undefined);

const storageKey = (scope: string) => `mesero-ia:cart:${scope}`;

export function CartProvider({
  /** Identifica la comanda: la mesa del QR o el restaurante en delivery. */
  scope,
  /** Menú vigente; sirve para descartar platillos que ya no existen. */
  products,
  children,
}: {
  scope: string;
  products: Product[];
  children: ReactNode;
}) {
  const [draft, setDraft] = useState<OrderDraft>(emptyDraft);
  const hydratedRef = useRef(false);

  // Se recupera lo guardado en cuanto llega el menú, para poder validar contra
  // él: un platillo que el restaurante quitó o encareció no debe colarse en la
  // comanda solo porque estaba en el navegador del cliente.
  useEffect(() => {
    if (hydratedRef.current || products.length === 0) return;
    hydratedRef.current = true;
    try {
      const saved = localStorage.getItem(storageKey(scope));
      if (!saved) return;
      const parsed = JSON.parse(saved) as OrderDraft;
      const byId = new Map(products.map((p) => [p.id, p]));
      const lines = (parsed.lines ?? [])
        .filter((l) => byId.has(l.product.id))
        .map((l) => ({ ...l, product: byId.get(l.product.id)! }));
      setDraft({ lines, diners: parsed.diners ?? null, currentSeat: null });
    } catch {
      // Un carrito guardado ilegible no debe impedir pedir: se ignora.
    }
  }, [scope, products]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      localStorage.setItem(storageKey(scope), JSON.stringify(draft));
    } catch {
      // Modo privado o almacenamiento lleno: se sigue sin persistir.
    }
  }, [scope, draft]);

  const addLine = useCallback((line: Omit<DraftLine, "key">) => {
    setDraft((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        { ...line, key: `${line.product.id}-${Math.random().toString(36).slice(2, 9)}` },
      ],
    }));
  }, []);

  const removeLine = useCallback((key: string) => {
    setDraft((prev) => ({ ...prev, lines: prev.lines.filter((l) => l.key !== key) }));
  }, []);

  const setDiners = useCallback((diners: number | null) => {
    setDraft((prev) => ({ ...prev, diners }));
  }, []);

  const clear = useCallback(() => {
    // Se conserva cuántos son: la mesa no cambia de tamaño porque hayan mandado
    // una ronda a cocina.
    setDraft((prev) => ({ ...emptyDraft(), diners: prev.diners }));
  }, []);

  const total = useMemo(
    () => draft.lines.reduce((sum, l) => sum + l.product.price * l.quantity, 0),
    [draft.lines]
  );

  const value = useMemo(
    () => ({ draft, setDraft, addLine, removeLine, setDiners, clear, total }),
    [draft, addLine, removeLine, setDiners, clear, total]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart debe usarse dentro de CartProvider");
  return ctx;
}
