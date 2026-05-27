import { cn } from "../../lib/utils";

interface GovStatCardProps {
  label: string;
  value: string | number;
  tone?: "default" | "brand" | "danger" | "gold";
}

export function GovStatCard({ label, value, tone = "default" }: GovStatCardProps) {
  const toneClass = {
    default: "text-ink",
    brand: "text-brand",
    danger: "text-danger",
    gold: "text-gold-dark",
  }[tone];

  return (
    <div className="bg-surface border border-line-soft rounded-lg p-4">
      <div className="label-mono mb-2">{label}</div>
      <div className={cn("font-serif text-[28px] leading-none", toneClass)}>{value}</div>
    </div>
  );
}
