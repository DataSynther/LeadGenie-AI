import { cn } from "../../lib/utils";

interface KpiCardProps {
  label: string;
  value: string | number;
  delta?: { value: string; direction?: "up" | "down" };
  sub?: string;
  gold?: boolean;
}

export function KpiCard({ label, value, delta, sub, gold }: KpiCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[10px] border border-line-soft p-5",
        gold ? "bg-gradient-to-b from-gold-tint to-surface" : "bg-surface",
      )}
    >
      <div className="label-mono mb-3.5">{label}</div>
      <div className="font-serif text-display-xl text-ink flex items-baseline gap-1.5">
        <span>{value}</span>
        {delta && (
          <span
            className={cn(
              "ml-auto font-mono text-[11px]",
              delta.direction === "down"
                ? "text-danger"
                : gold
                  ? "text-gold-dark"
                  : "text-brand",
            )}
          >
            {delta.value}
          </span>
        )}
      </div>
      {sub && <div className="mt-2 text-[11px] text-ink-2">{sub}</div>}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 h-[3px] opacity-50",
          gold
            ? "bg-gradient-to-r from-gold to-transparent"
            : "bg-gradient-to-r from-brand to-transparent",
        )}
      />
    </div>
  );
}
