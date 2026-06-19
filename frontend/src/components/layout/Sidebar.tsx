import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  X,
  Activity,
  GitBranch,
  BarChart2,
  ShieldCheck,
  LayoutDashboard,
  InboxIcon,
  MessageCircle,
  DollarSign,
  Network,
  PanelLeftClose,
  Lock,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useSidebar } from "../../context/SidebarContext";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { ThemeToggle } from "../ThemeToggle";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: { text: string; tone: "danger" | "brand" | "neutral" };
  liveBadge?: boolean;
}

const WORKSPACE: NavItem[] = [
  { to: "/discover",        label: "Discover Leads",   icon: Search },
  { to: "/dashboard",       label: "Mission Control",  icon: LayoutDashboard },
  { to: "/command-center",  label: "Command Center",   icon: ShieldCheck },
  { to: "/approval",        label: "Outreach Queue",   icon: InboxIcon,    liveBadge: true },
  { to: "/finops",          label: "AI FinOps",        icon: DollarSign },
  { to: "/dev",             label: "AI Observability", icon: Activity },
  { to: "/lineage",         label: "Pipeline Lineage", icon: GitBranch },
  { to: "/prompt-versions", label: "Prompt Versions",  icon: BarChart2 },
  { to: "/whatsapp",        label: "WhatsApp Inbox",   icon: MessageCircle },
  { to: "/architecture",    label: "Pipeline Diagram", icon: Network },
  { to: "/governance",      label: "Contact Governance", icon: Lock },
];


function badgeClasses(tone: "danger" | "brand" | "neutral") {
  if (tone === "danger") return "bg-danger text-white";
  if (tone === "brand") return "bg-brand text-white";
  return "bg-surface-2 text-ink-2";
}

function NavItemRow({ item, onNavigate, queueCount }: { item: NavItem; onNavigate: () => void; queueCount?: number }) {
  const Icon = item.icon;
  const showLive = item.liveBadge && queueCount != null && queueCount > 0;
  return (
    <NavLink
      to={item.to}
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
          <span>{item.label}</span>
          {showLive && (
            <span className="ml-auto font-mono text-[10px] px-1.5 py-px rounded-lg font-medium bg-danger text-white">
              {queueCount}
            </span>
          )}
          {item.badge && !showLive && (
            <span
              className={cn(
                "ml-auto font-mono text-[10px] px-1.5 py-px rounded-lg font-medium",
                badgeClasses(item.badge.tone),
              )}
            >
              {item.badge.text}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

const ROLE_RANK: Record<string, number> = { viewer: 0, sdr: 1, manager: 2, admin: 3 };

export function Sidebar() {
  const { isOpen, close, isCollapsed, toggleCollapse } = useSidebar();
  const { user } = useAuth();
  const role = user?.role ?? "viewer";
  const { data: queueItems = [] } = useQuery({
    queryKey: ["approvalQueue"],
    queryFn: api.approvalQueue,
    refetchInterval: 30_000,
  });
  const queueCount = queueItems.length;
  const visibleNav = WORKSPACE.filter((item) => {
    if (item.to === "/governance") return ROLE_RANK[role] >= ROLE_RANK["manager"];
    return true;
  });

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

      {/* Desktop collapse button */}
      <button
        className="hidden md:flex absolute top-3 right-3 items-center justify-center w-7 h-7 rounded-md text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors z-10"
        onClick={toggleCollapse}
        aria-label="Collapse sidebar"
      >
        <PanelLeftClose size={14} strokeWidth={2} />
      </button>

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

      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-mute px-3 pt-4 pb-2">
        Workspace
      </div>
      {visibleNav.map((item) => (
        <NavItemRow key={item.to} item={item} onNavigate={close} queueCount={queueCount} />
      ))}

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
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
