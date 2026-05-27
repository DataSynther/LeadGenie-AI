import { cn } from "../../lib/utils";
import type { Conversation } from "../../data/conversations";

const TAG_STYLES = {
  objection: "bg-gold-tint text-gold-dark",
  positive: "bg-brand-soft text-brand",
  neutral: "bg-info-tint text-info",
};

interface ConvListItemProps {
  conv: Conversation;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function ConvListItem({ conv, selected, onSelect }: ConvListItemProps) {
  return (
    <div
      onClick={() => onSelect(conv.id)}
      className={cn(
        "px-4 py-3.5 border-b border-line-soft cursor-pointer transition-colors",
        selected
          ? "bg-brand-soft border-l-[3px] border-l-brand pl-[15px]"
          : "hover:bg-surface-hover"
      )}
    >
      <div className="flex justify-between mb-1">
        <span className="text-[13px] font-medium text-ink">{conv.name}</span>
        <span className="font-mono text-[10px] text-ink-mute">{conv.timestamp}</span>
      </div>
      <div className="text-[10px] text-ink-mute font-mono mt-0.5">{conv.meta}</div>
      <div className="text-[11px] text-ink-2 mt-1 overflow-hidden text-ellipsis whitespace-nowrap">
        {conv.preview}
      </div>
      <span className={cn(
        "inline-block mt-1.5 font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-px rounded font-semibold",
        TAG_STYLES[conv.tag.tone]
      )}>
        {conv.tag.label}
      </span>
    </div>
  );
}
