import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../contexts/AuthContext";
import type { Policy } from "../../types/database";

export function PoliciesPage() {
  const { restaurant } = useAuth();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [newPolicy, setNewPolicy] = useState("");

  async function load() {
    if (!restaurant) return;
    const { data } = await supabase
      .from("policies")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("sort_order");
    setPolicies((data as Policy[]) ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id]);

  async function addPolicy() {
    if (!restaurant || !newPolicy.trim()) return;
    await supabase.from("policies").insert({
      restaurant_id: restaurant.id,
      content: newPolicy.trim(),
      sort_order: policies.length,
    });
    setNewPolicy("");
    await load();
  }

  async function removePolicy(id: string) {
    await supabase.from("policies").delete().eq("id", id);
    await load();
  }

  if (!restaurant) return null;

  return (
    <div className="max-w-xl">
      <h2 className="mb-1 text-xl font-semibold">Políticas</h2>
      <p className="mb-4 text-sm text-neutral-500">
        Reglas que la IA debe respetar y comunicar (ej. "No dividimos cuentas", "Cocina
        compartida para mariscos").
      </p>

      <div className="mb-4 flex gap-2">
        <input
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          placeholder="Ej. No se dividen cuentas"
          value={newPolicy}
          onChange={(e) => setNewPolicy(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addPolicy()}
        />
        <button
          onClick={addPolicy}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Agregar
        </button>
      </div>

      <ul className="space-y-2">
        {policies.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-2"
          >
            <span className="text-sm">{p.content}</span>
            <button
              onClick={() => removePolicy(p.id)}
              className="text-sm text-red-600 hover:underline"
            >
              Eliminar
            </button>
          </li>
        ))}
        {policies.length === 0 && (
          <p className="text-sm text-neutral-400">Aún no has agregado políticas.</p>
        )}
      </ul>
    </div>
  );
}
