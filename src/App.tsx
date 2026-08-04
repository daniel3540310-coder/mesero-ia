import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { Login } from "./routes/Login";
import { OwnerDashboard } from "./routes/owner/OwnerDashboard";
import { DashboardLayout, DashboardIndexRedirect } from "./routes/dashboard/DashboardLayout";
import { InfoPage } from "./routes/dashboard/InfoPage";
import { MenuPage } from "./routes/dashboard/MenuPage";
import { PoliciesPage } from "./routes/dashboard/PoliciesPage";
import { AiInfoPage } from "./routes/dashboard/AiInfoPage";
import { TablesPage } from "./routes/dashboard/TablesPage";
import { OrdersPage } from "./routes/dashboard/OrdersPage";
import { ClientMenuPage } from "./routes/client/ClientMenuPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/owner"
            element={
              <ProtectedRoute role="owner">
                <OwnerDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute role="restaurant">
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardIndexRedirect />} />
            <Route path="info" element={<InfoPage />} />
            <Route path="menu" element={<MenuPage />} />
            <Route path="policies" element={<PoliciesPage />} />
            <Route path="ai-info" element={<AiInfoPage />} />
            <Route path="tables" element={<TablesPage />} />
            <Route path="orders" element={<OrdersPage />} />
          </Route>

          <Route path="/menu/:qrToken" element={<ClientMenuPage />} />

          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
