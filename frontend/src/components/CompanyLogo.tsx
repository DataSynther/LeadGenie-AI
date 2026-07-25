import { useState } from "react";
import { cn } from "../lib/utils";

// Free, anonymous, no signup — Clearbit's old logo.clearbit.com API was
// shut down Dec 2025 (folded into HubSpot). DuckDuckGo's icon service is a
// clean drop-in: 200 with the real favicon, or a clean 404 we can catch to
// fall back to an initials avatar — no API key, no rate-limit surprises.
function logoUrl(domain: string): string {
  return `https://icons.duckduckgo.com/ip3/${domain.trim().toLowerCase()}.ico`;
}

const AVATAR_HUES = [
  "bg-violet-100 text-violet-700",
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];

function hueFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i);
  return AVATAR_HUES[Math.abs(hash) % AVATAR_HUES.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function CompanyLogo({
  domain, name, size = 28, className,
}: { domain?: string | null; name: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);

  if (!domain || failed) {
    return (
      <div
        className={cn("rounded-md flex items-center justify-center font-semibold shrink-0", hueFor(name), className)}
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {initials(name)}
      </div>
    );
  }

  return (
    <img
      src={logoUrl(domain)}
      alt={`${name} logo`}
      onError={() => setFailed(true)}
      className={cn("rounded-md object-contain bg-white border border-line-soft shrink-0", className)}
      style={{ width: size, height: size }}
    />
  );
}
