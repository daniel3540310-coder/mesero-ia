import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabaseClient";
import {
  createRestaurant,
  deleteRestaurant,
  reactivateRestaurant,
  suspendRestaurant,
  updateRestaurant,
} from "../../lib/adminApi";
import { useAuth } from "../../contexts/AuthContext";
import type { Restaurant } from "../../types/database";

interface FormState {
  id: string | null;
  name: string;
  slug: string;
  username: string;
  password: string;
}

const emptyForm: FormState = { id: null, name: "", slug: "", username: "", password: "" };

export function OwnerDashboard() {
  const { logout } = useAuth();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("restaurants")
      .select("*")
      .order("created_at", { ascending: false });
    setRestaurants((data as Restaurant[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    setSaving(true);
    try {
      if (form.id) {
        await updateRestaurant({ id: form.id, name: form.name, slug: form.slug });
      } else {
        await createRestaurant({
          name: form.name,
          slug: form.slug,
          username: form.username,
          password: form.password,
        });
      }
      setForm(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(r: Restaurant) {
    if (r.status === "active") {
      await suspendRestaurant(r.id);
    } else {
      await reactivateRestaurant(r.id);
    }
    await load();
  }

  async function handleDelete(r: Restaurant) {
    if (!confirm(`¿Eliminar "${r.name}"? Esta acción no se puede deshacer.`)) return;
    await deleteRestaurant(r.id);
    await load();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Restaurantes</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setForm(emptyForm)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            + Nuevo restaurante
          </button>
          <button
            onClick={() => logout()}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Salir
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-neutral-500">Cargando…</p>
      ) : restaurants.length === 0 ? (
        <p className="text-neutral-500">Aún no hay restaurantes registrados.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {restaurants.map((r) => (
                <tr key={r.id} className="border-t border-neutral-100">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-neutral-500">{r.slug}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.status === "active"
                          ? "bg-green-100 text-green-700"
                          : "bg-neutral-200 text-neutral-600"
                      }`}
                    >
                      {r.status === "active" ? "Activo" : "Suspendido"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      onClick={() =>
                        setForm({ id: r.id, name: r.name, slug: r.slug, username: "", password: "" })
                      }
                      className="text-brand-600 hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleToggleStatus(r)}
                      className="text-neutral-600 hover:underline"
                    >
                      {r.status === "active" ? "Suspender" : "Reactivar"}
                    </button>
                    <button
                      onClick={() => handleDelete(r)}
                      className="text-red-600 hover:underline"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={handleSave}
            className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-lg"
          >
            <h2 className="text-lg font-semibold">
              {form.id ? "Editar restaurante" : "Nuevo restaurante"}
            </h2>
            <div>
              <label className="mb-1 block text-sm font-medium">Nombre</label>
              <input
                required
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Slug (URL)</label>
              <input
                required
                pattern="[a-z0-9-]+"
                title="Solo minúsculas, números y guiones"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </div>
            {!form.id && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Usuario de acceso
                  </label>
                  <input
                    required
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Contraseña</label>
                  <input
                    required
                    type="password"
                    minLength={6}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </div>
              </>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
