import { Navigate, useLocation } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { useAuth } from "../context/AuthContext";

export function PrivateLayout() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  // Wait for token validation before redirecting — prevents flash to /login
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-base">
        <div className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-mute animate-pulse">
          Verifying session…
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <AppShell />;
}
