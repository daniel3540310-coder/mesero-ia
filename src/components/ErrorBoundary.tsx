import { Component, type ReactNode } from "react";

/**
 * Pantalla mostrada cuando la app no puede arrancar (config faltante o
 * crash inesperado). El cliente nunca debe ver una pantalla en blanco sin
 * explicación.
 */
export function StartupErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-8">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold text-neutral-900">
          No pudimos cargar Mesero IA
        </h1>
        <p className="mt-2 text-sm text-neutral-600">{message}</p>
        <p className="mt-4 text-xs text-neutral-400">
          Si acabas de desplegar en Vercel, revisa que las variables de entorno
          (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) estén configuradas en Project
          Settings → Environment Variables, y vuelve a desplegar.
        </p>
      </div>
    </div>
  );
}

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Red de seguridad para errores que ocurren durante el renderizado de la
 * app ya arrancada (no cubre fallos al cargar módulos, ver main.tsx).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Error no controlado en Mesero IA:", error);
  }

  render() {
    if (this.state.error) {
      return <StartupErrorScreen message={this.state.error.message} />;
    }
    return this.props.children;
  }
}
