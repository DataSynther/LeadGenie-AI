import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Download, Loader2, ExternalLink, ChevronDown, ChevronRight, Library,
  Building2, MessageSquareText, Send, Bot, User,
} from "lucide-react";
import { CompanyLogo } from "../CompanyLogo";
import { api, type KYCOnePagerRecord, type OnePagerSource, type OnePagerSection, type KycChatMessage } from "../../lib/api";
import { cn } from "../../lib/utils";

const TALKING_POINTS_TITLE = "Suggested Talking Points";

// ── Citations ───────────────────────────────────────────────────────────────

function CitationBadge({
  sourceId, expanded, onToggle,
}: { sourceId: number; expanded: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-mono font-semibold ml-1 align-middle transition-colors",
        expanded ? "bg-brand text-white" : "bg-brand/10 text-brand hover:bg-brand/20"
      )}
    >
      {sourceId}
    </button>
  );
}

function SourceReveal({ source }: { source: OnePagerSource | undefined }) {
  if (!source) return null;
  return (
    <div className="mt-1 mb-1.5 ml-4 px-2.5 py-1.5 rounded-md bg-surface-2 border border-line-soft text-[10px] text-ink-2">
      <span className="font-mono text-ink-mute">[{source.id}]</span> {source.label}
      {source.url && (
        <a href={source.url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-brand hover:underline mt-0.5">
          <ExternalLink size={9} /> {source.url}
        </a>
      )}
    </div>
  );
}

function SourcesPanel({ sources, label = "Sources" }: { sources: OnePagerSource[]; label?: string }) {
  const [open, setOpen] = useState(false);
  if (sources.length === 0) return null;
  return (
    <div className="rounded-md border border-line-soft bg-surface-2 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-mute">
          <Library size={11} /> {label} ({sources.length})
        </div>
        {open ? <ChevronDown size={13} className="text-ink-mute" /> : <ChevronRight size={13} className="text-ink-mute" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1.5 border-t border-line-soft pt-2">
          {sources.map(s => (
            <div key={s.id} className="text-[11px] text-ink-2">
              <span className="font-mono text-ink-mute">[{s.id}]</span> {s.label}
              {s.url && (
                <a href={s.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-brand hover:underline mt-0.5">
                  <ExternalLink size={9} /> {s.url}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BulletList({
  sections, sourceById,
}: { sections: OnePagerSection[]; sourceById: Record<number, OnePagerSource> }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <>
      {sections.map((section, si) => (
        <section key={si} className="mb-5">
          <div className="label-mono text-ink mb-2">{section.title}</div>
          <ul className="space-y-1.5">
            {section.bullets.map((bullet, bi) => {
              const key = `${si}-${bi}`;
              return (
                <li key={bi}>
                  <div className="text-[12px] text-ink leading-relaxed flex items-start gap-1.5">
                    <span className="text-brand shrink-0 mt-0.5">•</span>
                    <span>
                      {bullet.text}
                      <CitationBadge
                        sourceId={bullet.source_id}
                        expanded={expanded === key}
                        onToggle={() => setExpanded(expanded === key ? null : key)}
                      />
                    </span>
                  </div>
                  {expanded === key && <SourceReveal source={sourceById[bullet.source_id]} />}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

// ── Chat ────────────────────────────────────────────────────────────────────

function KYCChatPanel({ record }: { record: KYCOnePagerRecord }) {
  const [messages, setMessages] = useState<KycChatMessage[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const chatMutation = useMutation({
    mutationFn: (message: string) =>
      api.kycChat(record.onepager.company_name || record.company_name, record.onepager, message, messages),
    onSuccess: (res, message) => {
      setMessages(prev => [...prev, { role: "user", content: message }, { role: "assistant", content: res.response }]);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatMutation.isPending]);

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || chatMutation.isPending) return;
    setInput("");
    chatMutation.mutate(trimmed);
  }

  return (
    <div className="flex flex-col h-[60vh]">
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-3">
        {messages.length === 0 && (
          <div className="text-[11px] text-ink-mute text-center py-10">
            Ask anything about {record.company_name} — answers are grounded strictly in this
            briefing's cited facts. If something isn't covered, it'll say so instead of guessing.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
            {m.role === "assistant" && (
              <div className="w-6 h-6 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                <Bot size={12} className="text-brand" />
              </div>
            )}
            <div className={cn(
              "max-w-[80%] px-3 py-2 rounded-lg text-[12px] leading-relaxed whitespace-pre-wrap",
              m.role === "user" ? "bg-brand text-white" : "bg-surface-2 text-ink border border-line-soft"
            )}>
              {m.content}
            </div>
            {m.role === "user" && (
              <div className="w-6 h-6 rounded-full bg-surface-2 flex items-center justify-center shrink-0">
                <User size={12} className="text-ink-2" />
              </div>
            )}
          </div>
        ))}
        {chatMutation.isPending && (
          <div className="flex gap-2 justify-start">
            <div className="w-6 h-6 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
              <Bot size={12} className="text-brand" />
            </div>
            <div className="px-3 py-2 rounded-lg bg-surface-2 border border-line-soft">
              <Loader2 size={12} className="animate-spin text-ink-mute" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSend()}
          placeholder={`Ask about ${record.company_name}…`}
          className="flex-1 text-[12px] px-3 py-2 rounded-lg border border-line-soft bg-surface-2 text-ink placeholder:text-ink-mute focus:outline-none focus:border-brand transition-colors"
        />
        <button
          onClick={handleSend}
          disabled={chatMutation.isPending || !input.trim()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-[12px] font-medium disabled:opacity-50 transition-opacity"
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  );
}

// ── Detail (tabbed) ──────────────────────────────────────────────────────────

export type DetailTab = "overview" | "talking-points" | "chat";

export function OnePagerDetail({
  record, initialTab = "overview",
}: { record: KYCOnePagerRecord; initialTab?: DetailTab }) {
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const [downloading, setDownloading] = useState(false);
  const { onepager } = record;
  const sourceById = Object.fromEntries(onepager.sources.map(s => [s.id, s]));

  const overviewSections = onepager.sections.filter(s => s.title !== TALKING_POINTS_TITLE);
  const talkingSection = onepager.sections.find(s => s.title === TALKING_POINTS_TITLE);
  const talkingSourceIds = new Set((talkingSection?.bullets ?? []).map(b => b.source_id));
  const talkingSources = onepager.sources.filter(s => talkingSourceIds.has(s.id));
  const overviewSourceIds = new Set(overviewSections.flatMap(s => s.bullets.map(b => b.source_id)));
  const overviewSources = onepager.sources.filter(s => overviewSourceIds.has(s.id));

  async function handleExport() {
    setDownloading(true);
    try {
      await api.downloadKycOnepagerDocx(record.onepager_id, onepager.company_name || record.company_name);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="card-base p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <CompanyLogo domain={record.company_domain} name={record.company_name} size={36} className="mt-0.5" />
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-widest text-brand mb-1.5">
              {record.company_name} · {new Date(record.created_at).toLocaleDateString()}
            </div>
            <div className="font-sans font-semibold text-[19px] text-ink leading-snug">{onepager.headline}</div>
          </div>
        </div>
        <button
          onClick={handleExport}
          disabled={downloading}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand text-white text-[11px] font-medium disabled:opacity-50 transition-opacity"
        >
          {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          Export .docx
        </button>
      </div>

      <div className="flex gap-1.5 border-b border-line-soft">
        {([
          ["overview", "Overview", Building2],
          ["talking-points", "Talking Points", MessageSquareText],
          ["chat", "Chat", Bot],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium border-b-2 -mb-px transition-colors",
              tab === id ? "border-brand text-brand" : "border-transparent text-ink-mute hover:text-ink"
            )}
          >
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div>
          <BulletList sections={overviewSections} sourceById={sourceById} />
          <SourcesPanel sources={overviewSources} label="Sources" />
        </div>
      )}

      {tab === "talking-points" && talkingSection && (
        <div>
          <div className="text-[11px] text-ink-mute mb-3">
            Blends what {record.company_name} appears to need with what Ganit has actually done for
            similar organizations — each point cites which side of that it's drawing from.
          </div>
          <BulletList sections={[talkingSection]} sourceById={sourceById} />
          <SourcesPanel sources={talkingSources} label="Talking Point Sources" />
        </div>
      )}

      {tab === "chat" && <KYCChatPanel record={record} />}
    </div>
  );
}
