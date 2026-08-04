import { NavLink, Outlet, Navigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

const links = [
  { to: "/dashboard/info", label: "Información" },
  { to: "/dashboard/menu", label: "Menú" },
  { to: "/dashboard/policies", label: "Políticas" },
  { to: "/dashboard/ai-info", label: "Info para la IA" },
  { to: "/dashboard/tables", label: "Mesas" },
  { to: "/dashboard/orders", label: "Pedidos" },
];

export function DashboardLayout() {
  const { restaurant, logout } = useAuth();

  if (!restaurant) {
    return <div className="p-8 text-center text-neutral-500">Cargando restaurante…</div>;
  }

  if (restaurant.status === "suspended") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-sm rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="font-medium text-amber-800">
            Tu cuenta está suspendida. Contacta al administrador.
          </p>
          <button
            onClick={() => logout()}
            className="mt-4 rounded-lg border border-amber-300 px-4 py-2 text-sm text-amber-800 hover:bg-amber-100"
          >
            Salir
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-400">Mesero IA</p>
            <h1 className="text-lg font-semibold">{restaurant.name}</h1>
          </div>
          <button
            onClick={() => logout()}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
          >
            Salir
          </button>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
                  isActive
                    ? "bg-brand-600 text-white"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

export function DashboardIndexRedirect() {
  return <Navigate to="/dashboard/info" replace />;
}
