import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary, StartupErrorScreen } from "./components/ErrorBoundary";
import "./index.css";

const root = createRoot(document.getElementById("root")!);

// Se valida aquí, antes de importar el árbol de la app (que carga el cliente
// de Supabase), para que una config faltante muestre un mensaje claro en vez
// de una pantalla en blanco: un `throw` durante la carga de un módulo no lo
// atrapa un ErrorBoundary de React, solo ocurre durante el renderizado.
const missingEnv = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY;

if (missingEnv) {
  root.render(
    <StartupErrorScreen message="Faltan las variables de entorno VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY." />
  );
} else {
  import("./App")
    .then(({ default: App }) => {
      root.render(
        <StrictMode>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </StrictMode>
      );
    })
    .catch((error: Error) => {
      root.render(<StartupErrorScreen message={error.message} />);
    });
}
