import { cn } from "../lib/utils";

interface StatusPillProps {
  children: React.ReactNode;
  tone?: "brand" | "danger";
  pulse?: boolean;
}

export function StatusPill({
  children,
  tone = "brand",
  pulse = true,
}: StatusPillProps) {
  const dotColor =
    tone === "danger"
      ? "bg-danger shadow-[0_0_8px_#DC2626]"
      : "bg-brand shadow-[0_0_8px_#6D28D9]";
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface border border-line rounded-full font-mono text-[10px] uppercase tracking-[0.08em] text-ink-2">
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          dotColor,
          pulse && "animate-soft-pulse",
        )}
      />
      {children}
    </span>
  );
}
