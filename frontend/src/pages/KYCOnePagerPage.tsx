import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Loader2, Building2, Landmark, TrendingUp, MessageSquareText, Bot, Search,
} from "lucide-react";
import { Topbar } from "../components/layout/Topbar";
import { CompanyLogo } from "../components/CompanyLogo";
import { SDRWallpaperLayer } from "../components/kyc/SDRWallpaperLayer";
import { api } from "../lib/api";
import { cn } from "../lib/utils";
import type { DetailTab, HighlightSection } from "../components/kyc/OnePagerDetail";

// ── Reveal-on-scroll hook — fires once, never re-collapses ────────────────────

function useInView<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { rootMargin: "0px", threshold: 0.25 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView]);

  return [ref, inView];
}

// ── Creative hero — circular AI-agent diagram ──────────────────────────────────

interface HeroNode {
  id: string;
  label: string;
  sub: string;
  icon: typeof Building2;
  angle: number;
  tab: DetailTab | null;
  highlight: HighlightSection;
}

const HERO_NODES: HeroNode[] = [
  { id: "facts",    label: "Company Facts",    sub: "Apollo-sourced",       icon: Building2,         angle: 0,   tab: "overview",       highlight: "Company Overview" },
  { id: "finance",  label: "Financial Filings", sub: "Real SEC EDGAR data",  icon: Landmark,          angle: 60,  tab: "overview",       highlight: "Financial Performance" },
  { id: "talking",  label: "Talking Points",    sub: "Ganit KB matched",     icon: MessageSquareText, angle: 120, tab: "talking-points", highlight: null },
  { id: "chat",     label: "Ask Anything",      sub: "Grounded chat",        icon: Bot,               angle: 180, tab: "chat",           highlight: null },
  { id: "discover", label: "Discover Leads",    sub: "Find new accounts",    icon: Search,            angle: 240, tab: null,              highlight: null },
  { id: "market",   label: "Market Context",    sub: "Cited funding trends", icon: TrendingUp,        angle: 300, tab: "overview",       highlight: "Market Context" },
];

function KYCHero({ onNodeClick }: { onNodeClick: (node: HeroNode) => void }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const R = 38;

  return (
    <div
      ref={ref}
      className="bg-surface border border-line-soft rounded-[10px] shadow-card p-6 sm:p-10 mb-6 relative"
    >
      {/* Decorative backdrop — soft gradient wash only; kept clear of icon
          clutter so it doesn't compete with the diagram itself. Clipped to
          its own layer (not the card) so the node labels are never cut off. */}
      <div className="absolute inset-0 rounded-[10px] overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-16 -left-16 w-64 h-64 rounded-full bg-brand/10 blur-3xl" />
        <div className="absolute -bottom-16 -right-16 w-72 h-72 rounded-full bg-gold/10 blur-3xl" />
        <div className="absolute top-1/3 right-0 w-48 h-48 rounded-full bg-brand/5 blur-3xl" />
      </div>

      <div className="relative mx-auto aspect-square" style={{ width: "100%", maxWidth: 520 }}>
        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full animate-spin-slow" aria-hidden>
          <circle
            cx="50" cy="50" r={R}
            fill="none"
            stroke="rgb(var(--c-brand) / 0.18)"
            strokeWidth="0.6"
            strokeDasharray="2.5 3.5"
          />
        </svg>

        {/* Center mascot — enlarged, gently floating, standing on a glowing dais */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10">
          <div className="absolute w-44 h-44 rounded-full bg-brand/25 blur-3xl animate-soft-pulse" aria-hidden />
          <div className="animate-float">
            <img
              src="/bot-logo.png"
              alt="LeadGenie AI"
              className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-full object-cover ring-4 ring-brand/30 shadow-[0_0_36px_rgba(109,40,217,0.4)]"
            />
          </div>
          {/* Dais — a glowing elliptical platform under the mascot's feet */}
          <div
            className="relative w-32 h-6 sm:w-40 sm:h-7 rounded-[50%] -mt-1"
            style={{
              background: "radial-gradient(ellipse at center, rgb(var(--c-brand) / 0.55) 0%, rgb(var(--c-brand) / 0.18) 55%, transparent 75%)",
            }}
            aria-hidden
          />
          <div className="relative font-mono text-[9px] uppercase tracking-widest text-ink-mute mt-2 whitespace-nowrap">
            AI Agent
          </div>
        </div>

        {HERO_NODES.map((node, i) => {
          const rad = (node.angle * Math.PI) / 180;
          const x = 50 + R * Math.sin(rad);
          const y = 50 - R * Math.cos(rad);
          const Icon = node.icon;
          const isDiscover = node.id === "discover";
          return (
            <button
              key={node.id}
              onClick={() => onNodeClick(node)}
              style={{ left: `${x}%`, top: `${y}%`, transitionDelay: inView ? `${i * 90}ms` : "0ms" }}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5 group focus:outline-none transition-all duration-500",
                inView ? "opacity-100 scale-100" : "opacity-0 scale-50",
              )}
            >
              <div className="animate-float" style={{ animationDelay: `${i * 0.35}s` }}>
                <div
                  className={cn(
                    "w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full flex items-center justify-center shadow-sm border transition-all duration-300 group-hover:scale-115 group-hover:shadow-btn-brand",
                    isDiscover
                      ? "bg-gold-tint border-gold/30 group-hover:bg-gold group-hover:border-gold"
                      : "bg-brand-soft border-brand/20 group-hover:bg-brand group-hover:border-brand",
                  )}
                >
                  <Icon
                    size={24}
                    className={cn(
                      "transition-colors",
                      isDiscover ? "text-gold-dark group-hover:text-white" : "text-brand group-hover:text-white"
                    )}
                  />
                </div>
              </div>
              <div className="text-center">
                <div className="text-[12px] font-medium text-ink whitespace-nowrap group-hover:text-brand transition-colors">
                  {node.label}
                </div>
                <div className="text-[9.5px] text-ink-mute font-mono whitespace-nowrap hidden sm:block">
                  {node.sub}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="relative text-center text-[11px] text-ink-mute mt-3">
        One AI agent, six grounded angles — click any to jump in.
      </div>
    </div>
  );
}

export function KYCOnePagerPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [domain, setDomain] = useState("");
  const [name, setName] = useState("");
  const formRef = useRef<HTMLDivElement>(null);

  const listQuery = useQuery({
    queryKey: ["kycOnepagers"],
    queryFn: api.listKycOnepagers,
  });
  const onepagers = listQuery.data?.onepagers ?? [];

  const generateMutation = useMutation({
    mutationFn: () => api.generateKycOnepager(domain.trim(), name.trim() || undefined),
    onSuccess: (record) => {
      queryClient.invalidateQueries({ queryKey: ["kycOnepagers"] });
      setDomain("");
      setName("");
      navigate(`/kyc/${record.onepager_id}`);
    },
  });

  function handleHeroClick(node: HeroNode) {
    if (node.id === "discover") {
      navigate("/discover");
      return;
    }
    const mostRecent = onepagers[0];
    if (mostRecent) {
      const params = new URLSearchParams();
      if (node.tab) params.set("tab", node.tab);
      if (node.highlight) params.set("highlight", node.highlight);
      const qs = params.toString();
      navigate(`/kyc/${mostRecent.onepager_id}${qs ? `?${qs}` : ""}`);
    } else {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      formRef.current?.querySelector("input")?.focus();
    }
  }

  return (
    <div className="relative min-h-full">
      <SDRWallpaperLayer tileSize={260} className="-z-10" />

      <Topbar
        breadcrumb="Sales / Know Your Customer"
        title={<>KYC <span className="text-brand">One-Pager</span></>}
      />

      <div className="p-4 sm:p-8 pb-20">
        <div ref={formRef} className="card-base p-5 sm:p-6 mb-6 max-w-xl mx-auto scroll-mt-6">
          <div className="font-mono text-[10px] uppercase tracking-widest text-ink-mute mb-3 text-center">
            Generate Briefing
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              value={domain}
              onChange={e => setDomain(e.target.value)}
              onKeyDown={e => e.key === "Enter" && domain.trim() && generateMutation.mutate()}
              placeholder="Company domain — stripe.com"
              className="flex-1 text-[12px] px-3 py-2.5 rounded-lg border border-line-soft bg-surface-2 text-ink placeholder:text-ink-mute focus:outline-none focus:border-brand transition-colors"
            />
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Company name (optional)"
              className="flex-1 text-[12px] px-3 py-2.5 rounded-lg border border-line-soft bg-surface-2 text-ink placeholder:text-ink-mute focus:outline-none focus:border-brand transition-colors"
            />
            <button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending || !domain.trim()}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand text-white text-[12px] font-medium disabled:opacity-50 transition-opacity whitespace-nowrap"
            >
              {generateMutation.isPending
                ? <><Loader2 size={13} className="animate-spin" /> Researching…</>
                : <><FileText size={13} /> Generate</>}
            </button>
          </div>
          {generateMutation.isError && (
            <div className="text-[10px] text-red-400 font-mono mt-2 text-center">
              ✗ {(generateMutation.error as Error)?.message || "Failed — check backend"}
            </div>
          )}
        </div>

        <KYCHero onNodeClick={handleHeroClick} />

        <div className="card-base overflow-hidden max-w-4xl mx-auto">
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
          <div className="p-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {onepagers.map(o => (
              <button
                key={o.onepager_id}
                onClick={() => navigate(`/kyc/${o.onepager_id}`)}
                className="text-left px-3 py-2.5 rounded-md border border-line-soft bg-surface hover:border-brand/30 hover:bg-brand-soft/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <CompanyLogo domain={o.company_domain} name={o.company_name} size={20} />
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium text-ink truncate">{o.company_name}</div>
                    <div className="text-[10px] text-ink-mute font-mono mt-0.5">
                      {new Date(o.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
