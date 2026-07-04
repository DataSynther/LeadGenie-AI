import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Search, Network, List, ExternalLink, Tag, X, Loader2, Eye, GraduationCap, Sparkles, Briefcase } from "lucide-react";
import { Topbar } from "../components/layout/Topbar";
import { api, type NetworkLead, type NetworkGraphData } from "../lib/api";
import { cn } from "../lib/utils";

const SKILL_COLOUR  = "#34d399";
const SCHOOL_COLOUR = "#fbbf24";

// ── Colour palette ─────────────────────────────────────────────────────────────
const INDUSTRY_COLOURS: Record<string, string> = {
  "technology":        "#8b5cf6",
  "software":          "#8b5cf6",
  "financial services":"#f59e0b",
  "healthcare":        "#10b981",
  "retail":            "#0ea5e9",
  "manufacturing":     "#f87171",
  "education":         "#a78bfa",
  "media":             "#ec4899",
  "default":           "#94a3b8",
};

function industryColour(industry = "") {
  const k = industry.toLowerCase();
  for (const [key, val] of Object.entries(INDUSTRY_COLOURS)) {
    if (k.includes(key)) return val;
  }
  return INDUSTRY_COLOURS.default;
}

// ── Force-directed graph (vanilla canvas) ────────────────────────────────────

interface FNode {
  id: string; label: string; type: "lead" | "company" | "skill" | "school";
  industry?: string; x: number; y: number; vx: number; vy: number;
  title?: string; linkedin_url?: string;
}
interface FEdge { source: string; target: string; label: string; type?: string }

function nodeRadius(type: FNode["type"]) {
  return type === "company" ? 14 : type === "lead" ? 8 : 6;
}

function nodeColour(n: { type: FNode["type"]; industry?: string }) {
  if (n.type === "company") return industryColour(n.industry);
  if (n.type === "skill")   return SKILL_COLOUR;
  if (n.type === "school")  return SCHOOL_COLOUR;
  return "#94a3b8"; // lead
}

function useForceGraph(data: NetworkGraphData | undefined, width: number, height: number) {
  const [nodes, setNodes] = useState<FNode[]>([]);
  const edgesRef = useRef<FEdge[]>([]);

  useEffect(() => {
    if (!data) return;
    const existing = new Map(nodes.map(n => [n.id, n]));
    const next: FNode[] = data.nodes.map(n => ({
      ...n,
      x: existing.get(n.id)?.x ?? (Math.random() * width * 0.8 + width * 0.1),
      y: existing.get(n.id)?.y ?? (Math.random() * height * 0.8 + height * 0.1),
      vx: 0, vy: 0,
    }));
    edgesRef.current = data.edges;
    setNodes(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, width, height]);

  const tick = useCallback(() => {
    setNodes(prev => {
      if (!prev.length) return prev;
      const nodeMap = new Map(prev.map(n => [n.id, { ...n }]));

      // Repulsion
      for (const a of nodeMap.values()) {
        for (const b of nodeMap.values()) {
          if (a.id === b.id) continue;
          const dx = a.x - b.x; const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy || 1;
          const f  = 1200 / d2;
          a.vx += dx * f; a.vy += dy * f;
        }
      }
      // Spring attraction along edges
      for (const e of edgesRef.current) {
        const s = nodeMap.get(e.source); const t = nodeMap.get(e.target);
        if (!s || !t) continue;
        const dx = t.x - s.x; const dy = t.y - s.y;
        const d  = Math.sqrt(dx * dx + dy * dy) || 1;
        const f  = (d - 120) * 0.04;
        s.vx += dx / d * f; s.vy += dy / d * f;
        t.vx -= dx / d * f; t.vy -= dy / d * f;
      }
      // Gravity toward centre
      const cx = width / 2; const cy = height / 2;
      for (const n of nodeMap.values()) {
        n.vx += (cx - n.x) * 0.003;
        n.vy += (cy - n.y) * 0.003;
        n.vx *= 0.82; n.vy *= 0.82;
        n.x = Math.max(20, Math.min(width - 20, n.x + n.vx));
        n.y = Math.max(20, Math.min(height - 20, n.y + n.vy));
      }
      return Array.from(nodeMap.values());
    });
  }, [width, height]);

  return { nodes, edges: edgesRef.current, tick };
}

function GraphCanvas({
  data, onSelect,
}: { data: NetworkGraphData; onSelect: (id: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const W = 700; const H = 480;
  const { nodes, edges, tick } = useForceGraph(data, W, H);
  const rafRef = useRef<number>(0);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let running = true;
    function loop() {
      if (!running) return;
      tick();
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [tick]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !nodes.length) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);

    // Draw edges
    for (const e of edges) {
      const s = nodes.find(n => n.id === e.source);
      const t = nodes.find(n => n.id === e.target);
      if (!s || !t) continue;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      if (e.type === "shared_topic") {
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(139,92,246,0.25)";
        ctx.lineWidth = 1.5;
      } else if (e.type === "has_skill") {
        ctx.setLineDash([3, 2]);
        ctx.strokeStyle = "rgba(52,211,153,0.35)";
        ctx.lineWidth = 1;
      } else if (e.type === "studied_at") {
        ctx.setLineDash([3, 2]);
        ctx.strokeStyle = "rgba(251,191,36,0.35)";
        ctx.lineWidth = 1;
      } else {
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(148,163,184,0.2)";
        ctx.lineWidth = 1;
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw nodes
    for (const n of nodes) {
      const isSelected = n.id === selected;
      const r   = nodeRadius(n.type);
      const col = nodeColour(n);
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? "#ffffff" : col + "cc";
      ctx.fill();
      ctx.strokeStyle = isSelected ? col : col + "66";
      ctx.lineWidth   = isSelected ? 2.5 : 1;
      ctx.stroke();

      // Label
      ctx.fillStyle   = "rgba(226,232,240,0.9)";
      ctx.font        = n.type === "company" ? "bold 10px monospace" : "9px monospace";
      ctx.textAlign   = "center";
      ctx.fillText(n.label.slice(0, 18), n.x, n.y + r + 11);
    }
  }, [nodes, edges, selected]);

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (W / rect.width);
    const my = (e.clientY - rect.top)  * (H / rect.height);
    for (const n of nodes) {
      const r = nodeRadius(n.type);
      const dx = mx - n.x; const dy = my - n.y;
      if (dx * dx + dy * dy < r * r + 20) {
        const id = n.id === selected ? null : n.id;
        setSelected(id);
        onSelect(id);
        return;
      }
    }
    setSelected(null);
    onSelect(null);
  }

  return (
    <canvas
      ref={canvasRef} width={W} height={H}
      onClick={handleClick}
      className="w-full rounded-lg cursor-pointer"
      style={{ background: "rgb(var(--c-surface))" }}
    />
  );
}

// ── Lead table row ─────────────────────────────────────────────────────────────

function LeadRow({ lead, onTag, onView }: { lead: NetworkLead; onTag: (id: string, tag: string) => void; onView: (id: string) => void }) {
  const [tagInput, setTagInput] = useState("");
  const [showTag, setShowTag]   = useState(false);
  return (
    <tr className="border-b border-line-soft hover:bg-surface-2/50 transition-colors">
      <td className="px-3 py-2">
        <button onClick={() => onView(lead.lead_id)} className="text-left group">
          <div className="text-[12px] font-medium text-ink group-hover:text-brand transition-colors">{lead.name}</div>
          <div className="text-[10px] text-ink-mute">{lead.title}</div>
        </button>
      </td>
      <td className="px-3 py-2 text-[11px] text-ink-2">{lead.company}</td>
      <td className="px-3 py-2 text-[11px] text-ink-2">{lead.industry}</td>
      <td className="px-3 py-2 text-[11px] text-ink-2">{lead.region}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {(lead.topics || []).slice(0, 4).map(t => (
            <span key={t} className="font-mono text-[9px] px-1.5 py-px rounded bg-brand/10 text-brand border border-brand/20">
              {t}
            </span>
          ))}
          {lead.match_type === "graph" && (
            <span className="font-mono text-[9px] px-1.5 py-px rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              graph
            </span>
          )}
          {lead.match_type === "semantic" && (
            <span className="font-mono text-[9px] px-1.5 py-px rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
              semantic
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <button onClick={() => onView(lead.lead_id)}
            className="text-ink-mute hover:text-brand transition-colors" title="View full profile">
            <Eye size={12} />
          </button>
          {lead.linkedin_url && (
            <a href={lead.linkedin_url} target="_blank" rel="noreferrer"
              className="text-ink-mute hover:text-brand transition-colors">
              <ExternalLink size={12} />
            </a>
          )}
          <button onClick={() => setShowTag(!showTag)}
            className="text-ink-mute hover:text-brand transition-colors ml-1">
            <Tag size={12} />
          </button>
        </div>
        {showTag && (
          <div className="flex items-center gap-1 mt-1">
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && tagInput.trim()) {
                  onTag(lead.lead_id, tagInput.trim());
                  setTagInput(""); setShowTag(false);
                }
              }}
              placeholder="add tag…"
              className="text-[10px] px-1.5 py-0.5 rounded border border-line-soft bg-surface-2 text-ink w-20 focus:outline-none focus:border-brand"
            />
          </div>
        )}
      </td>
    </tr>
  );
}

// ── Lead detail drawer (skills / education / past roles via get_lead_full) ────

function LeadDetailDrawer({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const { data: lead, isLoading } = useQuery({
    queryKey: ["networkLeadFull", leadId],
    queryFn:  () => api.networkLeadFull(leadId),
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm h-full bg-[rgb(var(--c-surface))] border-l border-line-soft shadow-2xl overflow-y-auto p-5 space-y-5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-mute">Lead Profile</span>
          <button onClick={onClose} className="text-ink-mute hover:text-ink transition-colors">
            <X size={16} />
          </button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center h-32 text-[11px] text-ink-mute">
            <Loader2 size={14} className="animate-spin mr-2" /> Loading profile…
          </div>
        )}

        {!isLoading && !lead && (
          <div className="text-[11px] text-ink-mute">Lead not found in network.</div>
        )}

        {lead && (
          <>
            <div>
              <div className="text-[15px] font-medium text-ink">{lead.name}</div>
              <div className="text-[12px] text-ink-2">{lead.title}{lead.company ? ` · ${lead.company}` : ""}</div>
              <div className="text-[11px] text-ink-mute">{lead.industry}{lead.region ? ` · ${lead.region}` : ""}</div>
              {lead.linkedin_url && (
                <a href={lead.linkedin_url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-[11px] text-brand hover:underline mt-1">
                  <ExternalLink size={11} /> LinkedIn Profile
                </a>
              )}
            </div>

            {(lead.work_email || lead.phone) && (
              <div className="space-y-1 text-[11px] text-ink-2">
                {lead.work_email && <div>{lead.work_email}</div>}
                {lead.phone && <div>{lead.phone}</div>}
              </div>
            )}

            {lead.topics?.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5 text-[10px] uppercase tracking-widest text-ink-mute">
                  <Tag size={11} /> Topics
                </div>
                <div className="flex flex-wrap gap-1">
                  {lead.topics.map(t => (
                    <span key={t} className="font-mono text-[9px] px-1.5 py-px rounded bg-brand/10 text-brand border border-brand/20">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {lead.skills?.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5 text-[10px] uppercase tracking-widest text-ink-mute">
                  <Sparkles size={11} style={{ color: SKILL_COLOUR }} /> Skills
                </div>
                <div className="flex flex-wrap gap-1">
                  {lead.skills.map(s => (
                    <span key={s} className="font-mono text-[9px] px-1.5 py-px rounded border"
                      style={{ background: `${SKILL_COLOUR}1a`, color: SKILL_COLOUR, borderColor: `${SKILL_COLOUR}33` }}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {lead.education?.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5 text-[10px] uppercase tracking-widest text-ink-mute">
                  <GraduationCap size={11} style={{ color: SCHOOL_COLOUR }} /> Education
                </div>
                <div className="space-y-1.5">
                  {lead.education.filter(e => e.school).map((e, i) => (
                    <div key={i} className="text-[11px]">
                      <div className="text-ink">{e.school}</div>
                      <div className="text-ink-mute text-[10px]">
                        {[e.degree, [e.start, e.end].filter(Boolean).join(" – ")].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {lead.past_roles?.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5 text-[10px] uppercase tracking-widest text-ink-mute">
                  <Briefcase size={11} /> Past Roles
                </div>
                <div className="space-y-1.5">
                  {lead.past_roles.filter(r => r.company).map((r, i) => (
                    <div key={i} className="text-[11px]">
                      <div className="text-ink">{r.title}{r.title && r.company ? " · " : ""}{r.company}</div>
                      <div className="text-ink-mute text-[10px]">
                        {[r.start, r.end].filter(Boolean).join(" – ")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

type ViewMode = "graph" | "list";

export function LeadNetworkPage() {
  const [view, setView]     = useState<ViewMode>("list");
  const [query, setQuery]   = useState("");
  const [submitted, setSubmitted] = useState("");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);

  const leadsQuery = useQuery({
    queryKey: ["networkLeads"],
    queryFn:  () => api.networkLeads({ limit: 100 }),
    refetchInterval: 60_000,
  });

  const graphQuery = useQuery({
    queryKey: ["networkGraph"],
    queryFn:  () => api.networkGraph(40),
    enabled:  view === "graph",
    refetchInterval: 60_000,
  });

  const searchMutation = useMutation({
    mutationFn: (q: string) => api.networkQuery(q, 20),
  });

  const tagMutation = useMutation({
    mutationFn: ({ lead_id, tag }: { lead_id: string; tag: string }) =>
      api.networkTagLead(lead_id, [tag]),
    onSuccess: () => leadsQuery.refetch(),
  });

  function handleSearch() {
    if (!query.trim()) return;
    setSubmitted(query);
    searchMutation.mutate(query);
  }

  const displayLeads: NetworkLead[] = submitted && searchMutation.data
    ? searchMutation.data.results
    : (leadsQuery.data?.leads ?? []);

  const selectedNodeData = selectedNode
    ? graphQuery.data?.nodes.find(n => n.id === selectedNode)
    : null;

  const totalStored = leadsQuery.data?.total ?? 0;

  return (
    <>
      <Topbar
        breadcrumb="Lead Network"
        title={<>Lead <em className="text-brand italic">Network</em></>}
        right={
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-ink-mute px-2 py-1 rounded bg-surface-2 border border-line-soft">
              {totalStored} leads stored
            </span>
            <button
              onClick={() => setView("list")}
              className={cn("p-1.5 rounded transition-colors", view === "list" ? "bg-brand/10 text-brand" : "text-ink-mute hover:text-ink")}
            ><List size={14} /></button>
            <button
              onClick={() => setView("graph")}
              className={cn("p-1.5 rounded transition-colors", view === "graph" ? "bg-brand/10 text-brand" : "text-ink-mute hover:text-ink")}
            ><Network size={14} /></button>
          </div>
        }
      />

      <div className="p-4 sm:p-8 pb-20 space-y-5">

        {/* ── NL Query bar ──────────────────────────────────────────────────── */}
        <div className="card-base p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-mute">
              Knowledge Query
            </span>
          </div>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder='e.g. "find orgs migrating from Google to AWS in India" or "fintech CTOs in SE Asia"'
              className="flex-1 text-[12px] px-3 py-2 rounded-lg border border-line-soft bg-surface-2 text-ink placeholder:text-ink-mute focus:outline-none focus:border-brand transition-colors"
            />
            <button
              onClick={handleSearch}
              disabled={searchMutation.isPending || !query.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-[12px] font-medium disabled:opacity-50 transition-opacity"
            >
              {searchMutation.isPending
                ? <Loader2 size={13} className="animate-spin" />
                : <Search size={13} />}
              Search
            </button>
            {submitted && (
              <button
                onClick={() => { setQuery(""); setSubmitted(""); searchMutation.reset(); }}
                className="p-2 rounded-lg text-ink-mute hover:text-ink hover:bg-surface-2 transition-colors"
              ><X size={14} /></button>
            )}
          </div>

          {/* Intent chips */}
          {searchMutation.data?.intent && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(searchMutation.data.intent.topics || []).map(t => (
                <span key={t} className="font-mono text-[9px] px-2 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/20">
                  #{t}
                </span>
              ))}
              {searchMutation.data.intent.region && (
                <span className="font-mono text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  📍 {searchMutation.data.intent.region}
                </span>
              )}
              <span className="font-mono text-[9px] text-ink-mute self-center">
                {searchMutation.data.total} results
              </span>
            </div>
          )}
        </div>

        {/* ── Graph view ────────────────────────────────────────────────────── */}
        {view === "graph" && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
            <div className="card-base p-3">
              {graphQuery.isLoading && (
                <div className="flex items-center justify-center h-48 text-[11px] text-ink-mute">
                  Loading graph…
                </div>
              )}
              {graphQuery.data && (
                <GraphCanvas data={graphQuery.data} onSelect={setSelectedNode} />
              )}
              {!graphQuery.isLoading && !graphQuery.data && (
                <div className="flex items-center justify-center h-48 text-[11px] text-ink-mute">
                  No network data yet. Leads are stored automatically on outreach.
                </div>
              )}
            </div>

            {/* Node detail panel */}
            <div className="card-base p-4 space-y-3">
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink-mute">
                {selectedNodeData ? "Node Detail" : "Graph Legend"}
              </div>
              {selectedNodeData ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ background: nodeColour(selectedNodeData) }} />
                    <span className="text-[13px] font-medium text-ink">{selectedNodeData.label}</span>
                  </div>
                  <div className="text-[10px] text-ink-mute capitalize">{selectedNodeData.type}</div>
                  {selectedNodeData.industry && (
                    <div className="text-[11px] text-ink-2">{selectedNodeData.industry}</div>
                  )}
                  {selectedNodeData.title && (
                    <div className="text-[11px] text-ink-2">{selectedNodeData.title}</div>
                  )}
                  {selectedNodeData.linkedin_url && (
                    <a href={selectedNodeData.linkedin_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-[11px] text-brand hover:underline">
                      <ExternalLink size={11} /> LinkedIn Profile
                    </a>
                  )}
                  {selectedNodeData.type === "lead" && (
                    <button
                      onClick={() => setDetailLeadId(selectedNodeData.id.replace(/^lead:/, ""))}
                      className="flex items-center gap-1.5 mt-2 px-2.5 py-1.5 rounded-lg bg-brand/10 text-brand text-[11px] font-medium hover:bg-brand/20 transition-colors"
                    >
                      <Eye size={12} /> View full profile
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2 text-[10px] text-ink-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-violet-400" />Company node
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-slate-400" />Lead node
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: SKILL_COLOUR }} />Skill node (PDL)
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: SCHOOL_COLOUR }} />School node (PDL)
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-px bg-violet-400/50" />Shared topic
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-px bg-slate-400/40" />Works at / previously at
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-px border-t border-dashed" style={{ borderColor: SKILL_COLOUR }} />Has skill
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-px border-t border-dashed" style={{ borderColor: SCHOOL_COLOUR }} />Studied at
                  </div>
                  <div className="mt-3 text-ink-mute">Click a node to inspect it.</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── List view ─────────────────────────────────────────────────────── */}
        {view === "list" && (
          <div className="card-base overflow-hidden">
            {leadsQuery.isLoading && (
              <div className="flex items-center justify-center h-32 text-[11px] text-ink-mute">
                Loading leads…
              </div>
            )}
            {!leadsQuery.isLoading && displayLeads.length === 0 && (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <Network size={28} className="text-ink-mute/40" />
                <div className="text-[11px] text-ink-mute text-center">
                  {submitted
                    ? "No leads matched your query."
                    : "No leads in network yet. They're stored automatically when you generate outreach."}
                </div>
              </div>
            )}
            {displayLeads.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-line-soft bg-surface-2/50">
                      {["Lead", "Company", "Industry", "Region", "Topics", ""].map(h => (
                        <th key={h} className="px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-ink-mute">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayLeads.map(lead => (
                      <LeadRow
                        key={lead.lead_id}
                        lead={lead}
                        onTag={(id, tag) => tagMutation.mutate({ lead_id: id, tag })}
                        onView={setDetailLeadId}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {detailLeadId && (
        <LeadDetailDrawer leadId={detailLeadId} onClose={() => setDetailLeadId(null)} />
      )}
    </>
  );
}
