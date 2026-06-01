import { cn } from "../../lib/utils";
import type { PipelineStage } from "../../lib/api";

const STAGE_STYLES: Record<
  PipelineStage,
  { bg: string; text: string; label: string }
> = {
  new: { bg: "bg-surface-2", text: "text-ink-2", label: "New" },
  researching: { bg: "bg-info-tint", text: "text-info", label: "Researching" },
  sent: { bg: "bg-brand-soft", text: "text-brand", label: "Sent" },
  engaged: { bg: "bg-magenta/10", text: "text-magenta-dark", label: "Engaged" },
  pending_approval: {
    bg: "bg-danger-tint",
    text: "text-danger",
    label: "Pending approval",
  },
  meeting_booked: {
    bg: "bg-gold-tint",
    text: "text-gold-dark",
    label: "Meeting booked",
  },
  closed_no_reply: {
    bg: "bg-surface-2",
    text: "text-ink-mute",
    label: "Closed",
  },
};

export function StageChip({ stage }: { stage: PipelineStage }) {
  const style = STAGE_STYLES[stage] || STAGE_STYLES.new;
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full font-mono text-[10px] uppercase tracking-[0.06em] font-semibold",
        style.bg,
        style.text,
      )}
    >
      {style.label}
    </span>
  );
}
