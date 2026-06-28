import { useLocation } from "react-router-dom";
import { ShieldOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { canAccess } from "../lib/rbac";
import type { UserRole } from "../lib/rbac";

export function RoleGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();

  const role = (user?.role ?? "viewer") as UserRole;

  if (!canAccess(role, pathname)) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4 px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-danger/10 flex items-center justify-center">
          <ShieldOff size={28} strokeWidth={1.5} className="text-danger" />
        </div>
        <div>
          <div className="text-[18px] font-semibold text-ink mb-1">Not Authorized</div>
          <div className="text-[13px] text-ink-mute max-w-xs">
            Your role (<span className="font-mono font-semibold text-ink capitalize">{role}</span>) does not
            have access to this page. Contact your admin to request access.
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
