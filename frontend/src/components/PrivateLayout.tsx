import { Navigate, useLocation } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { useAuth } from "../context/AuthContext";

export function PrivateLayout() {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <AppShell />;
}
