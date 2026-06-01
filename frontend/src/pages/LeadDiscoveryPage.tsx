import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Search, UserPlus, Zap } from "lucide-react";
import { Topbar } from "../components/layout/Topbar";
import { ResearchPanel } from "../components/research/ResearchPanel";
import { api } from "../lib/api";
import type { Lead } from "../lib/api";
import { cn } from "../lib/utils";

const SENIORITIES = [
  { value: "c_suite", label: "C-Suite" },
  { value: "vp", label: "VP" },
  { value: "director", label: "Director" },
  { value: "manager", label: "Manager" },
  { value: "senior", label: "Senior IC" },
];

export function LeadDiscoveryPage() {
  const [companyNames, setCompanyNames] = useState("");
  const [titles, setTitles] = useState("VP Data, VP Engineering, CTO, Head of Data");
  const [seniorities, setSeniorities] = useState<string[]>(["vp", "c_suite", "director"]);
  const [perPage, setPerPage] = useState(25);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const search = useMutation({
    mutationFn: () =>
      api.leadSearch({
        company_names: companyNames.split(",").map((c) => c.trim()).filter(Boolean),
        titles: titles.split(",").map((t) => t.trim()).filter(Boolean),
        seniorities,
        per_page: perPage,
      }),
  });

  function toggleSeniority(val: string) {
    setSeniorities((prev) =>
      prev.includes(val) ? prev.filter((s) => s !== val) : [...prev, val]
    );
  }

  return (
    <>
      <Topbar
        breadcrumb="Workspace / Discover"
        title={<>Lead <em className="text-brand italic">Discovery</em></>}
        right={<span className="label-mono hidden sm:block">Powered by Apollo.io</span>}
      />

      <div className="p-4 sm:p-8 pb-20">
        {/* Search parameters */}
        <div className="card-base mb-5">
          <div className="px-5 py-4 border-b border-line-soft">
            <div className="font-serif text-display-md text-ink">
              Search <em className="text-brand italic">parameters</em>
            </div>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-5">
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

            <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
              <div className="flex-1">
                <label className="label-mono mb-2 block text-ink">Seniority</label>
                <div className="flex gap-2 flex-wrap">
                  {SENIORITIES.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => toggleSeniority(s.value)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-[11px] font-mono font-medium border transition-colors",
                        seniorities.includes(s.value)
                          ? "bg-brand text-white border-brand"
                          : "bg-surface text-ink border-line hover:border-brand hover:text-brand"
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

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

        {/* Results */}
        <div className="card-base">
          <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between">
            <div className="font-serif text-display-md text-ink">
              {search.data ? (
                <>
                  Found <em className="text-brand italic">{search.data.length}</em> leads
                </>
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
              No leads found. Try broadening the search parameters.
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
      </div>
    </>
  );
}
