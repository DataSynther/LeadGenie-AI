import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Download, Loader2, ExternalLink, ChevronDown, ChevronRight, Library,
  Building2, Landmark, TrendingUp, MessageSquareText, Send, Bot, User,
} from "lucide-react";
import { Topbar } from "../components/layout/Topbar";
import { api, type KYCOnePagerRecord, type OnePagerSource, type OnePagerSection, type KycChatMessage } from "../lib/api";
import { cn } from "../lib/utils";

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

type DetailTab = "overview" | "talking-points" | "chat";

function OnePagerDetail({ record, detailRef }: { record: KYCOnePagerRecord; detailRef: React.RefObject<HTMLDivElement | null> }) {
  const [tab, setTab] = useState<DetailTab>("overview");
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
    <div ref={detailRef} className="card-base p-6 space-y-5 scroll-mt-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-brand mb-1.5">
            {record.company_name} · {new Date(record.created_at).toLocaleDateString()}
          </div>
          <div className="font-serif text-[19px] text-ink leading-snug">{onepager.headline}</div>
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

// ── Creative hero — semi-circle capability nav ────────────────────────────────

const HERO_NODES: { id: string; label: string; sub: string; icon: typeof Building2; angle: number }[] = [
  { id: "facts",    label: "Company Facts",     sub: "Apollo-sourced",     icon: Building2,          angle: -80 },
  { id: "finance",  label: "Financial Filings",  sub: "Real SEC EDGAR data", icon: Landmark,         angle: -40 },
  { id: "market",   label: "Market Context",     sub: "Cited funding trends", icon: TrendingUp,       angle: 0 },
  { id: "talking",  label: "Talking Points",     sub: "Ganit KB matched",   icon: MessageSquareText, angle: 40 },
  { id: "chat",     label: "Ask Anything",       sub: "Grounded chat",      icon: Bot,               angle: 80 },
];

function KYCHero({ onNodeClick }: { onNodeClick: (id: string) => void }) {
  const R = 130;
  return (
    <div className="card-base p-6 sm:p-8 mb-5 overflow-hidden relative">
      <div className="relative mx-auto" style={{ width: "100%", maxWidth: 560, height: 220 }}>
        <svg viewBox="0 0 560 220" className="absolute inset-0 w-full h-full" aria-hidden>
          <path
            d="M 40 220 A 240 240 0 0 1 520 220"
            fill="none"
            stroke="rgb(var(--c-brand) / 0.15)"
            strokeWidth="2"
            strokeDasharray="4 5"
          />
        </svg>
        {HERO_NODES.map(node => {
          const rad = (node.angle * Math.PI) / 180;
          const cx = 280 + R * Math.sin(rad);
          const cy = 200 - R * Math.cos(rad);
          const Icon = node.icon;
          return (
            <button
              key={node.id}
              onClick={() => onNodeClick(node.id)}
              className="absolute flex flex-col items-center gap-1.5 -translate-x-1/2 -translate-y-1/2 group"
              style={{ left: `${(cx / 560) * 100}%`, top: `${(cy / 220) * 100}%` }}
            >
              <div className="w-11 h-11 rounded-full bg-brand-soft border border-brand/20 flex items-center justify-center group-hover:bg-brand group-hover:border-brand transition-colors shadow-sm">
                <Icon size={17} className="text-brand group-hover:text-white transition-colors" />
              </div>
              <div className="text-center">
                <div className="text-[10px] font-medium text-ink whitespace-nowrap">{node.label}</div>
                <div className="text-[8px] text-ink-mute font-mono whitespace-nowrap">{node.sub}</div>
              </div>
            </button>
          );
        })}
        <div className="absolute left-1/2 bottom-0 -translate-x-1/2 flex flex-col items-center">
          <FileText size={26} className="text-brand/50" />
          <div className="font-mono text-[9px] uppercase tracking-widest text-ink-mute mt-1">One-Pager</div>
        </div>
      </div>
      <div className="text-center text-[11px] text-ink-mute mt-2">
        One briefing, five grounded angles — click any to jump in.
      </div>
    </div>
  );
}

export function KYCOnePagerPage() {
  const queryClient = useQueryClient();
  const [domain, setDomain] = useState("");
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const listQuery = useQuery({
    queryKey: ["kycOnepagers"],
    queryFn: api.listKycOnepagers,
  });

  const generateMutation = useMutation({
    mutationFn: () => api.generateKycOnepager(domain.trim(), name.trim() || undefined),
    onSuccess: (record) => {
      queryClient.invalidateQueries({ queryKey: ["kycOnepagers"] });
      setSelectedId(record.onepager_id);
      setDomain("");
      setName("");
    },
  });

  const onepagers = listQuery.data?.onepagers ?? [];
  const selected = onepagers.find(o => o.onepager_id === selectedId) ?? generateMutation.data ?? null;

  function handleHeroClick() {
    if (selected) {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      formRef.current?.querySelector("input")?.focus();
    }
  }

  return (
    <>
      <Topbar
        breadcrumb="Sales / Know Your Customer"
        title={<>KYC <em className="text-brand italic">One-Pager</em></>}
      />

      <div className="p-4 sm:p-8 pb-20">
        <KYCHero onNodeClick={handleHeroClick} />

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
          <div className="space-y-4">
            <div ref={formRef} className="card-base p-4 scroll-mt-6">
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink-mute mb-3">
                Generate Briefing
              </div>
              <label className="block mb-2.5">
                <div className="text-[10px] text-ink-2 mb-1">Company domain</div>
                <input
                  value={domain}
                  onChange={e => setDomain(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && domain.trim() && generateMutation.mutate()}
                  placeholder="stripe.com"
                  className="w-full text-[12px] px-3 py-2 rounded-lg border border-line-soft bg-surface-2 text-ink placeholder:text-ink-mute focus:outline-none focus:border-brand transition-colors"
                />
              </label>
              <label className="block mb-3">
                <div className="text-[10px] text-ink-2 mb-1">Company name (optional)</div>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Stripe"
                  className="w-full text-[12px] px-3 py-2 rounded-lg border border-line-soft bg-surface-2 text-ink placeholder:text-ink-mute focus:outline-none focus:border-brand transition-colors"
                />
              </label>
              <button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending || !domain.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-brand text-white text-[12px] font-medium disabled:opacity-50 transition-opacity"
              >
                {generateMutation.isPending
                  ? <><Loader2 size={13} className="animate-spin" /> Researching…</>
                  : <><FileText size={13} /> Generate One-Pager</>}
              </button>
              {generateMutation.isError && (
                <div className="text-[10px] text-red-400 font-mono mt-2">
                  ✗ {(generateMutation.error as Error)?.message || "Failed — check backend"}
                </div>
              )}
            </div>

            <div className="card-base overflow-hidden">
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink-mute px-4 py-3 border-b border-line-soft">
                Past Briefings
              </div>
              {listQuery.isLoading && (
                <div className="px-4 py-6 text-[11px] text-ink-mute text-center">Loading…</div>
              )}
              {!listQuery.isLoading && onepagers.length === 0 && (
                <div className="px-4 py-6 text-[11px] text-ink-mute text-center">
                  No briefings yet. Generate one before your next customer call.
                </div>
              )}
              <div className="p-2 space-y-1.5 max-h-[60vh] overflow-y-auto">
                {onepagers.map(o => (
                  <button
                    key={o.onepager_id}
                    onClick={() => setSelectedId(o.onepager_id)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-md border transition-colors",
                      o.onepager_id === selectedId
                        ? "bg-brand-soft border-brand/25"
                        : "bg-surface border-line-soft hover:border-line"
                    )}
                  >
                    <div className="text-[12px] font-medium text-ink truncate">{o.company_name}</div>
                    <div className="text-[10px] text-ink-mute font-mono mt-0.5">
                      {new Date(o.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            {selected ? (
              <OnePagerDetail record={selected} detailRef={detailRef} />
            ) : (
              <div className="card-base p-10 flex flex-col items-center justify-center gap-2 text-center">
                <FileText size={28} className="text-ink-mute/40" />
                <div className="text-[12px] text-ink-mute">
                  Generate a briefing or pick one from the list — sourced facts, AI reads clearly labeled, and every line cited.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
