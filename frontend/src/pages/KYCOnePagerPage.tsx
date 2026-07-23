import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Download, Loader2, ExternalLink, ChevronDown, ChevronRight, Library } from "lucide-react";
import { Topbar } from "../components/layout/Topbar";
import { api, type KYCOnePagerRecord, type OnePagerSource } from "../lib/api";
import { cn } from "../lib/utils";

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

function SourcesPanel({ sources }: { sources: OnePagerSource[] }) {
  const [open, setOpen] = useState(false);
  if (sources.length === 0) return null;
  return (
    <div className="rounded-md border border-line-soft bg-surface-2 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-mute">
          <Library size={11} /> Sources ({sources.length})
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

function OnePagerDetail({ record }: { record: KYCOnePagerRecord }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const { onepager } = record;
  const sourceById = Object.fromEntries(onepager.sources.map(s => [s.id, s]));

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

      {onepager.sections.map((section, si) => (
        <section key={si}>
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

      <SourcesPanel sources={onepager.sources} />
    </div>
  );
}

export function KYCOnePagerPage() {
  const queryClient = useQueryClient();
  const [domain, setDomain] = useState("");
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  return (
    <>
      <Topbar
        breadcrumb="Sales / Know Your Customer"
        title={<>KYC <em className="text-brand italic">One-Pager</em></>}
      />

      <div className="p-4 sm:p-8 pb-20 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
        <div className="space-y-4">
          <div className="card-base p-4">
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
            <OnePagerDetail record={selected} />
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
    </>
  );
}
