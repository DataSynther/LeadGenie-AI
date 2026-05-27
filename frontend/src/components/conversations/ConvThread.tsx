import type { Conversation, ConvMessage } from "../../data/conversations";
import { cn } from "../../lib/utils";

function MessageBubble({ msg }: { msg: ConvMessage }) {
  const isOutbound = msg.direction === "outbound";
  return (
    <div className={cn("max-w-[75%]", isOutbound ? "self-end" : "self-start")}>
      <div className={cn(
        "font-mono text-[9px] uppercase tracking-[0.08em] text-ink-mute mb-1",
        isOutbound ? "text-right" : ""
      )}>
        {msg.sender} · {msg.channel} · {msg.timestamp}
      </div>
      <div className={cn(
        "px-4 py-3.5 rounded-lg text-[13px] leading-relaxed text-ink whitespace-pre-line",
        isOutbound
          ? "bg-brand-soft border border-brand-soft"
          : "bg-surface-2 border border-line-soft"
      )}>
        {msg.body}
      </div>
    </div>
  );
}

export function ConvThread({ conv }: { conv: Conversation }) {
  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="px-6 py-4 border-b border-line-soft flex justify-between items-center">
        <div>
          <div className="font-serif text-[20px] text-ink">{conv.thread.title}</div>
          <div className="font-mono text-[11px] text-ink-2 mt-0.5">{conv.thread.sub}</div>
        </div>
        <button className="btn-ghost">Hand off to AE</button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
        {conv.thread.messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}
      </div>

      {conv.thread.draft && <AiDraftPane draft={conv.thread.draft} />}
    </div>
  );
}

function AiDraftPane({ draft }: { draft: NonNullable<Conversation["thread"]["draft"]> }) {
  return (
    <div className="mx-6 mb-6 border-[1.5px] border-dashed border-gold bg-gold-tint rounded-lg p-4">
      <div className="flex justify-between mb-2.5">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-gold-dark flex items-center gap-1.5 font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-gold shadow-[0_0_8px_#FAB818] animate-soft-pulse" />
          AI DRAFT · Classified as {draft.classification}
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.1em] bg-danger-tint text-danger px-1.5 py-0.5 rounded font-semibold">
          {draft.riskReason}
        </span>
      </div>

      <div className="text-[13px] leading-relaxed text-ink mb-3.5">"{draft.text}"</div>

      <div className="text-[11px] text-ink-2 p-2.5 bg-surface rounded border-l-2 border-info mb-3">
        <strong className="text-info">Why this draft:</strong> {draft.explainer}
      </div>

      <div className="flex gap-2">
        <button className="px-2.5 py-1 rounded text-[11px] font-medium bg-brand text-white">Approve & Send</button>
        <button className="px-2.5 py-1 rounded text-[11px] font-medium bg-surface-2 text-ink border border-line">Edit</button>
        <button className="px-2.5 py-1 rounded text-[11px] font-medium bg-surface-2 text-ink border border-line">Regenerate</button>
        <button className="px-2.5 py-1 rounded text-[11px] font-medium bg-surface-2 text-ink border border-line ml-auto">
          Route to Human AE
        </button>
      </div>
    </div>
  );
}
