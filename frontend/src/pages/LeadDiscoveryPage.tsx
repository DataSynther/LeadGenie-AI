import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search, UserPlus, Zap } from "lucide-react";
import { Topbar } from "../components/layout/Topbar";
import { ResearchPanel } from "../components/research/ResearchPanel";
import { api } from "../lib/api";
import type { Lead } from "../lib/api";
import { cn } from "../lib/utils";

const SENIORITIES = [
  { value: "c_suite",  label: "C-Suite" },
  { value: "vp",       label: "VP" },
  { value: "director", label: "Director" },
  { value: "manager",  label: "Manager" },
  { value: "senior",   label: "Senior IC" },
];

// Values are substrings matched against Apollo / demo_companies industry strings
const DIVISIONS = [
  { value: "information technology", label: "Technology & IT" },
  { value: "health",                 label: "Health & Wellness" },
  { value: "food",                   label: "Food & Beverages" },
  { value: "publishing",             label: "Publishing & Media" },
  { value: "education",              label: "Education" },
  { value: "e-learning",             label: "E-Learning" },
  { value: "automotive",             label: "Automotive" },
  { value: "engineering",            label: "Engineering" },
  { value: "financial",              label: "Finance" },
  { value: "retail",                 label: "Retail / E-Commerce" },
];

const REGIONS = [
  { value: "India",          label: "India" },
  { value: "United States",  label: "USA" },
  { value: "United Kingdom", label: "UK" },
  { value: "Europe",         label: "Europe" },
  { value: "Southeast Asia", label: "SE Asia" },
  { value: "Australia",      label: "Australia" },
];

function PillGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div>
      <label className="label-mono mb-2 block text-ink">{label}</label>
      <div className="flex gap-2 flex-wrap">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(o.value)}
            className={cn(
              "px-3 py-1.5 rounded-full text-[11px] font-mono font-medium border transition-colors",
              selected.includes(o.value)
                ? "bg-brand text-white border-brand"
                : "bg-surface text-ink border-line hover:border-brand hover:text-brand"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function toggle(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
}

export function LeadDiscoveryPage() {
  const [companyNames, setCompanyNames] = useState("");
  const [titles,       setTitles]       = useState("");
  const [seniorities,  setSeniorities]  = useState<string[]>(["vp", "c_suite", "director"]);
  const [industries,   setIndustries]   = useState<string[]>([]);
  const [locations,    setLocations]    = useState<string[]>([]);
  const [perPage,      setPerPage]      = useState(25);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const search = useMutation({
    mutationFn: () =>
      api.leadSearch({
        company_names: companyNames.split(",").map((c) => c.trim()).filter(Boolean),
        titles:        titles.split(",").map((t) => t.trim()).filter(Boolean),
        seniorities,
        industries,
        locations,
        per_page: perPage,
      }),
  });

  const { data: approvalItems = [] } = useQuery({
    queryKey: ["approval"],
    queryFn: api.approvalQueue,
    refetchInterval: 30_000,
  });

  return (
    <>
      <Topbar
        breadcrumb="Workspace / Discover"
        title={<>Lead <span className="text-brand font-semibold">Discovery</span></>}
        right={<span className="label-mono hidden sm:block">Powered by Apollo.io</span>}
      />

      <div className="p-4 sm:p-8 pb-20">
        {/* Search parameters */}
        <div className="card-base mb-5">
          <div className="px-5 py-4 border-b border-line-soft">
            <div className="text-display-md font-semibold text-ink">
              Search <span className="text-brand">Parameters</span>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* Row 1 — text inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="label-mono mb-2 block text-ink">Company Name</label>
                <input
                  value={companyNames}
                  onChange={(e) => setCompanyNames(e.target.value)}
                  placeholder="Acme Corp, TechCorp (leave blank for broad search)"
                  className="w-full bg-surface border border-line text-ink px-3 py-2.5 rounded-md text-[13px] placeholder:text-ink-2 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft"
                />
              </div>
              <div>
                <label className="label-mono mb-2 block text-ink">Job Titles</label>
                <input
                  value={titles}
                  onChange={(e) => setTitles(e.target.value)}
                  placeholder="VP Engineering, CTO, Head of Data"
                  className="w-full bg-surface border border-line text-ink px-3 py-2.5 rounded-md text-[13px] placeholder:text-ink-2 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft"
                />
              </div>
            </div>

            {/* Row 2 — left: Seniority + Region stacked · right: Division */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Left column */}
              <div className="flex flex-col gap-5">
                <PillGroup
                  label="Seniority"
                  options={SENIORITIES}
                  selected={seniorities}
                  onToggle={(v) => setSeniorities((p) => toggle(p, v))}
                />
                <PillGroup
                  label="Region"
                  options={REGIONS}
                  selected={locations}
                  onToggle={(v) => setLocations((p) => toggle(p, v))}
                />
              </div>

              {/* Right column */}
              <PillGroup
                label="Division"
                options={DIVISIONS}
                selected={industries}
                onToggle={(v) => setIndustries((p) => toggle(p, v))}
              />
            </div>

            {/* Row 3 — Results + Search */}
            <div className="flex items-end justify-end gap-3">
              <div>
                <label className="label-mono mb-2 block text-ink">Results</label>
                <select
                  value={perPage}
                  onChange={(e) => setPerPage(Number(e.target.value))}
                  className="bg-surface border border-line text-ink px-3 py-2.5 rounded-md text-[13px]"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
              <button
                onClick={() => search.mutate()}
                disabled={search.isPending}
                className="btn-primary flex items-center gap-2"
              >
                <Search size={14} />
                {search.isPending ? "Searching..." : "Search Leads"}
              </button>
            </div>
          </div>
        </div>

        {/* Bottom row: Results + Human Review Queue */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5 items-start">

          {/* Results */}
          <div className="card-base">
            <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between">
              <div className="text-display-md font-semibold text-ink">
                {search.data ? (
                  <>Found <span className="text-brand">{search.data.length}</span> Leads</>
                ) : (
                  <>Results</>
                )}
              </div>
              {search.data && (
                <div className="label-mono">{search.data.length} prospects ready</div>
              )}
            </div>

            {!search.data && !search.isPending && !search.error && (
              <div className="py-20 text-center">
                <Search size={32} className="text-ink-mute mx-auto mb-3" strokeWidth={1.5} />
                <div className="text-ink-2 text-sm">Set your parameters above and search to discover leads.</div>
                <div className="text-ink-mute text-xs font-mono mt-1">Apollo.io · Live data</div>
              </div>
            )}

            {search.isPending && (
              <div className="py-20 text-center text-ink-mute text-sm font-mono">
                Searching Apollo.io...
              </div>
            )}

            {search.error && (
              <div className="py-20 text-center">
                <div className="text-danger text-sm font-medium mb-1">Search failed</div>
                <div className="text-ink-mute text-xs font-mono">
                  {(search.error as Error).message}
                </div>
              </div>
            )}

            {search.data && search.data.length === 0 && (
              <div className="py-20 text-center text-ink-mute text-sm">
                No leads found. Try broadening your search parameters.
              </div>
            )}

            {search.data && search.data.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-xs">
                  <thead>
                    <tr>
                      {["Name", "Title", "Company", "Seniority", "Email", ""].map((h) => (
                        <th
                          key={h}
                          className="text-left px-5 py-3.5 bg-surface-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink font-medium border-b border-line-soft"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {search.data.map((lead) => (
                      <tr
                        key={lead.id}
                        onClick={() => setSelectedLead(lead)}
                        className={cn(
                          "hover:bg-surface-2 transition-colors cursor-pointer",
                          selectedLead?.id === lead.id && "bg-brand-soft"
                        )}
                      >
                        <td className="px-5 py-4 border-b border-line-soft text-ink font-medium">
                          {lead.name}
                        </td>
                        <td className="px-5 py-4 border-b border-line-soft text-ink">
                          {lead.title}
                        </td>
                        <td className="px-5 py-4 border-b border-line-soft text-ink">
                          {lead.company}
                        </td>
                        <td className="px-5 py-4 border-b border-line-soft">
                          <span className="font-mono text-[10px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-surface-2 text-ink border border-line-soft">
                            {lead.seniority || "—"}
                          </span>
                        </td>
                        <td className="px-5 py-4 border-b border-line-soft font-mono text-[11px] text-ink">
                          {lead.email || (
                            <span className="text-ink-2 italic">not available</span>
                          )}
                        </td>
                        <td className="px-5 py-4 border-b border-line-soft">
                          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                            <button className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-brand-soft text-brand border border-brand/20 hover:bg-brand hover:text-white transition-colors">
                              <UserPlus size={11} />
                              Add
                            </button>
                            <button className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-surface-2 text-ink border border-line hover:border-brand hover:text-brand transition-colors">
                              <Zap size={11} />
                              Outreach
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {selectedLead && (
              <ResearchPanel
                lead={selectedLead}
                onClose={() => setSelectedLead(null)}
              />
            )}
          </div>

          {/* Human Review Queue */}
          <div className="card-base">
            <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between">
              <div className="text-display-md font-semibold text-ink">
                Human Review <span className="text-brand">Queue</span>
              </div>
              {approvalItems.length > 0 && (
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/25">
                  {approvalItems.length} pending
                </span>
              )}
            </div>

            <div className="p-4 space-y-3">
              {approvalItems.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="text-ink-2 text-sm">No pending reviews.</div>
                  <div className="text-ink-mute text-xs font-mono mt-1">All clear</div>
                </div>
              ) : (
                approvalItems.slice(0, 6).map((item, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 p-3 rounded-lg bg-surface-2 border border-line-soft"
                  >
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5",
                      item.risk_level === "high"
                        ? "bg-red-500/20 text-red-500"
                        : "bg-amber-500/20 text-amber-500"
                    )}>
                      !
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-ink leading-snug">
                        {item.lead_name}
                      </div>
                      <div className="text-[11px] text-ink-2 truncate">
                        {item.lead_title} · {item.company_name}
                      </div>
                      <div className="text-[10px] text-ink-mute font-mono mt-0.5 truncate">
                        {item.trigger ?? "governance_policy"}
                      </div>
                    </div>
                    <button className="flex-shrink-0 text-[10px] font-medium px-2.5 py-1 rounded bg-brand/15 text-brand border border-brand/25 hover:bg-brand/25 transition-colors">
                      Review
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
