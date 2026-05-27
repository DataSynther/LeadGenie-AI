import { NavLink } from "react-router-dom";
import {
  Activity,
  Sparkles,
  Database,
  MessagesSquare,
  ShieldAlert,
  ScrollText,
  Search,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: { text: string; tone: "danger" | "brand" | "neutral" };
}

const WORKSPACE: NavItem[] = [
  // { to: "/dashboard", label: "Mission Control", icon: Activity },
  { to: "/discover", label: "Discover Leads", icon: Search },
  // { to: "/campaigns", label: "Campaigns", icon: Sparkles },
  // {
  //   to: "/pipeline",
  //   label: "Pipeline",
  //   icon: Database,
  //   badge: { text: "847", tone: "neutral" },
  // },
  // {
  //   to: "/conversations",
  //   label: "Conversations",
  //   icon: MessagesSquare,
  //   badge: { text: "12", tone: "brand" },
  // },
];

const GOVERNANCE: NavItem[] = [
  {
    to: "/approval",
    label: "Approval Queue",
    icon: ShieldAlert,
    badge: { text: "7", tone: "danger" },
  },
  { to: "/audit", label: "Audit Trail", icon: ScrollText },
];

function badgeClasses(tone: "danger" | "brand" | "neutral") {
  if (tone === "danger") return "bg-danger text-white";
  if (tone === "brand") return "bg-brand text-white";
  return "bg-surface-2 text-ink-2";
}

function NavItemRow({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
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
          {item.badge && (
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

export function Sidebar() {
  return (
    <aside className="w-60 bg-surface border-r border-line-soft p-6 px-4 flex flex-col gap-1">
      <div className="flex flex-col items-center pb-6 pt-2">
        <img
          src="/bot-logo.png"
          alt="LeadGenie bot"
          className="w-30 h-30 rounded-full object-cover ring-2 ring-brand/40 shadow-[0_0_16px_rgba(106,50,122,0.30)] mb-3"
        />
        <div className="font-serif text-[32px] leading-none tracking-[-0.02em] text-ink">
          Lead<em className="text-brand italic">Genie</em>
        </div>
        <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-ink-mute mt-1.5">
          v0.1
        </div>
      </div>

      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-mute px-3 pt-4 pb-2">
        Workspace
      </div>
      {WORKSPACE.map((item) => (
        <NavItemRow key={item.to} item={item} />
      ))}

      {/* <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-mute px-3 pt-4 pb-2">
        Governance
      </div>
      {GOVERNANCE.map((item) => (
        <NavItemRow key={item.to} item={item} />
      ))} */}

      <div className="mt-auto pt-3 border-t border-line-soft flex items-center gap-2.5 px-3">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand to-gold flex items-center justify-center font-mono text-[11px] font-semibold text-white">
          PR
        </div>
        <div>
          <div className="text-xs text-ink">Priya R.</div>
          <div className="text-[10px] text-ink-mute font-mono">Sales Ops</div>
        </div>
      </div>
    </aside>
  );
}
