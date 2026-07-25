export type UserRole = "admin" | "manager" | "developer" | "sdr" | "viewer";

// Which roles may visit each route
export const ROUTE_ROLES: Record<string, UserRole[]> = {
  "/dashboard":       ["admin", "manager", "developer", "sdr", "viewer"],
  "/governance":      ["admin", "manager"],
  "/finops":          ["admin", "manager", "developer"],
  "/discover":        ["manager", "sdr"],
  "/network":         ["manager", "sdr"],
  "/whatsapp":        ["manager", "sdr"],
  "/approval":        ["manager", "sdr"],
  "/conversations":   ["manager", "sdr"],
  "/campaigns":       ["manager", "sdr"],
  "/dev":             ["manager", "developer"],
  "/architecture":    ["manager", "developer"],
  "/pipeline":        ["manager", "developer"],
  "/lineage":         ["manager", "developer"],
  "/kb-facts":        ["manager", "developer"],
  "/prompt-versions": ["manager", "developer"],
  "/command-center":  ["admin", "manager"],
  "/audit":           ["admin", "manager"],
  "/kickoff-notes":   ["admin", "manager"],
  "/announcements":   ["admin", "manager"],
  "/kyc":             ["admin", "manager", "sdr"],
};

export function canAccess(role: UserRole, path: string): boolean {
  // Match prefix (e.g. /audit/:leadId)
  const key = Object.keys(ROUTE_ROLES).find(
    (k) => path === k || path.startsWith(k + "/")
  );
  if (!key) return true; // unknown route — allow
  return ROUTE_ROLES[key].includes(role);
}

// Nav items shown per role (sidebar)
export interface NavDef {
  to: string;
  label: string;
  liveBadge?: boolean;
}

export const ROLE_NAV: Record<UserRole, NavDef[]> = {
  admin: [
    { to: "/kyc",            label: "KYC One-Pager" },
    { to: "/dashboard",      label: "Mission Control" },
    { to: "/governance",     label: "Contact Governance" },
    { to: "/finops",         label: "AI FinOps" },
    { to: "/audit",          label: "Audit Trail" },
    { to: "/kickoff-notes",  label: "Kickoff Notes" },
    { to: "/announcements",  label: "Announcements" },
  ],
  sdr: [
    { to: "/kyc",       label: "KYC One-Pager" },
    { to: "/discover",  label: "Discover Leads" },
    { to: "/dashboard", label: "Mission Control" },
    { to: "/approval",  label: "Outreach Queue", liveBadge: true },
    { to: "/network",   label: "Lead Network" },
    { to: "/whatsapp",  label: "WhatsApp Inbox" },
  ],
  developer: [
    { to: "/dashboard",    label: "Mission Control" },
    { to: "/dev",          label: "Developer's Tool" },
    { to: "/finops",       label: "AI FinOps" },
    { to: "/architecture", label: "Pipeline Diagram" },
    { to: "/lineage",      label: "Pipeline Lineage" },
    { to: "/kb-facts",     label: "KB Facts" },
    { to: "/prompt-versions", label: "Prompt Versions" },
  ],
  manager: [
    { to: "/kyc",           label: "KYC One-Pager" },
    { to: "/discover",     label: "Discover Leads" },
    { to: "/dashboard",    label: "Mission Control" },
    { to: "/approval",     label: "Outreach Queue", liveBadge: true },
    { to: "/network",      label: "Lead Network" },
    { to: "/whatsapp",     label: "WhatsApp Inbox" },
    { to: "/governance",   label: "Contact Governance" },
    { to: "/finops",       label: "AI FinOps" },
    { to: "/dev",          label: "Developer's Tool" },
    { to: "/architecture", label: "Pipeline Diagram" },
    { to: "/audit",        label: "Audit Trail" },
    { to: "/kickoff-notes", label: "Kickoff Notes" },
    { to: "/announcements", label: "Announcements" },
  ],
  viewer: [
    { to: "/dashboard", label: "Mission Control" },
  ],
};
