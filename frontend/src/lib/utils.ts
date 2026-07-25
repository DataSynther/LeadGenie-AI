import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

/** Best-effort domain guess for logo lookup when no real domain is on hand
 * (e.g. a lead/company record that only carries a name and maybe an email). */
export function guessCompanyDomain(companyName: string, email?: string | null): string {
  if (email?.includes("@")) return email.split("@")[1];
  return companyName.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com";
}

export const STAGE_LABELS: Record<string, string> = {
  new: "New",
  researching: "Researching",
  sent: "Sent",
  engaged: "Engaged",
  pending_approval: "Pending approval",
  meeting_booked: "Meeting booked",
  closed_no_reply: "Closed",
};
