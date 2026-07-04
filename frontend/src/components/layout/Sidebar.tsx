import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  X,
  Activity,
  LayoutDashboard,
  InboxIcon,
  MessageCircle,
  DollarSign,
  Network,
  PanelLeftClose,
  Lock,
  LogOut,
  Globe,
  GitBranch,
  BookOpen,
  FileCode2,
  ShieldCheck,
  NotebookPen,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useSidebar } from "../../context/SidebarContext";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { ThemeToggle } from "../ThemeToggle";
import { ROLE_NAV, type UserRole } from "../../lib/rbac";

const ICON_MAP: Record<string, LucideIcon> = {
  "/dashboard":       LayoutDashboard,
  "/discover":        Search,
  "/approval":        InboxIcon,
  "/finops":          DollarSign,
  "/dev":             Activity,
  "/whatsapp":        MessageCircle,
  "/architecture":    Network,
  "/network":         Globe,
  "/governance":      Lock,
  "/audit":           ShieldCheck,
  "/lineage":         GitBranch,
  "/kb-facts":        BookOpen,
  "/prompt-versions": FileCode2,
  "/kickoff-notes":   NotebookPen,
};

function NavItemRow({
  to, label, liveBadge, queueCount, onNavigate,
}: {
  to: string;
  label: string;
  liveBadge?: boolean;
  queueCount?: number;
  onNavigate: () => void;
}) {
  const Icon = ICON_MAP[to] ?? Activity;
  const showLive = liveBadge && queueCount != null && queueCount > 0;

  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "relative flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors",
          isActive
            ? "bg-brand-soft text-brand font-medium"
            : "text-ink-2 hover:bg-surface-2 hover:text-ink",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute -left-4 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-brand rounded-r" />
          )}
          <Icon size={14} strokeWidth={2} />
          <span>{label}</span>
          {showLive && (
            <span className="ml-auto font-mono text-[10px] px-1.5 py-px rounded-lg font-medium bg-danger text-white">
              {queueCount}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const { isOpen, close, isCollapsed, toggleCollapse } = useSidebar();
  const { user, logout } = useAuth();
  const role = (user?.role ?? "viewer") as UserRole;

  const { data: queueItems = [] } = useQuery({
    queryKey: ["approvalQueue"],
    queryFn: api.approvalQueue,
    refetchInterval: 30_000,
  });
  const queueCount = queueItems.length;

  const navItems = ROLE_NAV[role] ?? ROLE_NAV.viewer;

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 bg-surface border-r border-line-soft flex flex-col gap-1",
        "transition-[width,transform] duration-200 ease-in-out overflow-hidden",
        "md:relative md:translate-x-0 md:z-auto md:flex-shrink-0",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        isCollapsed ? "md:w-0 md:border-r-0 p-0" : "w-60 p-6 px-4",
      )}
    >
      {/* Mobile close */}
      <button
        className="absolute top-4 right-4 text-ink-2 hover:text-ink md:hidden"
        onClick={close}
        aria-label="Close menu"
      >
        <X size={18} strokeWidth={2} />
      </button>

      {/* Desktop collapse */}
      <button
        className="hidden md:flex absolute top-3 right-3 items-center justify-center w-7 h-7 rounded-md text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors z-10"
        onClick={toggleCollapse}
        aria-label="Collapse sidebar"
      >
        <PanelLeftClose size={14} strokeWidth={2} />
      </button>

      {/* Logo */}
      <div className="flex flex-col items-center pb-6 pt-2">
        <img
          src="/bot-logo.png"
          alt="LeadGenie bot"
          className="w-20 h-20 md:w-30 md:h-30 rounded-full object-cover ring-2 ring-brand/40 shadow-[0_0_16px_rgba(106,50,122,0.30)] mb-3"
        />
        <div className="font-serif text-[28px] md:text-[32px] leading-none tracking-[-0.02em] text-ink">
          Lead<em className="text-brand italic">Genie</em>
        </div>
        <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-ink-mute mt-1.5">
          v0.1
        </div>
      </div>

      {/* Nav */}
      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-mute px-3 pt-4 pb-2">
        Workspace
      </div>
      {navItems.map((item) => (
        <NavItemRow
          key={item.to}
          to={item.to}
          label={item.label}
          liveBadge={item.liveBadge}
          queueCount={queueCount}
          onNavigate={close}
        />
      ))}

      {/* User footer */}
      <div className="mt-auto pt-3 border-t border-line-soft flex flex-col gap-3 px-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand to-gold flex items-center justify-center font-mono text-[11px] font-semibold text-white">
              {(user?.username?.[0] ?? "?").toUpperCase()}
            </div>
            <div>
              <div className="text-xs text-ink capitalize">{user?.username ?? "—"}</div>
              <div className="text-[10px] text-ink-mute font-mono uppercase">{role}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button
              onClick={logout}
              className="flex items-center justify-center w-7 h-7 rounded-md text-ink-mute hover:text-danger hover:bg-danger/10 transition-colors"
              title="Sign out"
            >
              <LogOut size={13} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
