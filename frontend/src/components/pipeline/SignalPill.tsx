import { cn } from "../../lib/utils";
import type { Signal } from "../../lib/api";

export function SignalPill({ signal }: { signal: Signal }) {
  return (
    <span
      className={cn(
        "font-mono text-[9px] uppercase tracking-[0.06em] font-medium px-1.5 py-0.5 rounded",
        signal.strength === "hot"
          ? "bg-gold-tint text-gold-dark"
          : "bg-surface-2 text-ink-2",
      )}
    >
      {signal.label}
    </span>
  );
}
