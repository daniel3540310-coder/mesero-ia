import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import type { UserRole } from "../types/database";

export function ProtectedRoute({
  role,
  children,
}: {
  role: UserRole;
  children: ReactNode;
}) {
  const { loading, session, role: currentRole } = useAuth();

  if (loading) {
    return <div className="p-8 text-center text-neutral-500">Cargando…</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (currentRole !== role) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
