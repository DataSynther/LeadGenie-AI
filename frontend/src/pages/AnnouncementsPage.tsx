import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Send, Loader2, Users, Plus, CheckCircle2, XCircle, ChevronDown, ChevronRight, Paperclip, X, FileText } from "lucide-react";
import { Topbar } from "../components/layout/Topbar";
import { api, type CampaignRecord } from "../lib/api";
import { cn } from "../lib/utils";

const GROUP_LABELS: Record<string, string> = {
  data_engineering: "Data Engineering",
  data_science:     "Data Science",
  cloud:            "Cloud",
  data_warehouses:  "Data Warehouses",
  devops:           "DevOps",
  product:          "Product",
  fintech:          "Fintech",
  healthcare:       "Healthcare",
  ecommerce:        "Ecommerce",
  manufacturing:    "Manufacturing",
  logistics:        "Logistics",
  generic:          "General",
};

function CampaignHistoryItem({ campaign }: { campaign: CampaignRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-line-soft bg-surface-2 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
      >
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-ink truncate">{campaign.subject}</div>
          <div className="text-[10px] text-ink-mute font-mono mt-0.5">
            {new Date(campaign.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            {" · "}{campaign.groups.map(g => GROUP_LABELS[g] ?? g).join(", ")}
            {(campaign.attachments?.length ?? 0) > 0 && (
              <> {" · "}<Paperclip size={9} className="inline -mt-0.5" /> {campaign.attachments!.length}</>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="font-mono text-[10px] text-emerald-500">{campaign.sent_count} sent</span>
          {campaign.failed_count > 0 && (
            <span className="font-mono text-[10px] text-red-400">{campaign.failed_count} failed</span>
          )}
          {open ? <ChevronDown size={13} className="text-ink-mute" /> : <ChevronRight size={13} className="text-ink-mute" />}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1.5 border-t border-line-soft pt-2">
          {campaign.results.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px]">
              {r.sent ? <CheckCircle2 size={11} className="text-emerald-500 shrink-0" /> : <XCircle size={11} className="text-red-400 shrink-0" />}
              <span className="text-ink truncate">{r.name ?? r.email}</span>
              <span className="text-ink-mute font-mono truncate">{r.email}</span>
              {r.error && <span className="text-red-400 truncate">— {r.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AnnouncementsPage() {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [lastResult, setLastResult] = useState<CampaignRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newGroups, setNewGroups] = useState<string[]>([]);

  const groupsQuery = useQuery({ queryKey: ["campaignGroups"], queryFn: api.campaignGroups });
  const subsQuery   = useQuery({ queryKey: ["campaignSubscribers"], queryFn: api.campaignSubscribers });
  const historyQuery = useQuery({ queryKey: ["campaignHistory"], queryFn: api.campaignHistory });

  const suggestMutation = useMutation({
    mutationFn: () => api.suggestCampaignDraft(selectedGroups[0]),
    onSuccess: (draft) => { setSubject(draft.subject); setBody(draft.body); },
  });

  const sendMutation = useMutation({
    mutationFn: () => api.sendCampaign(subject.trim(), body.trim(), selectedGroups, files),
    onSuccess: (record) => {
      setLastResult(record);
      queryClient.invalidateQueries({ queryKey: ["campaignHistory"] });
      setSubject(""); setBody(""); setSelectedGroups([]); setFiles([]);
    },
  });

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles(prev => [...prev, ...Array.from(list)]);
  }

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }

  const addSubMutation = useMutation({
    mutationFn: () => api.addCampaignSubscriber(newEmail.trim(), newName.trim(), newGroups),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaignSubscribers"] });
      queryClient.invalidateQueries({ queryKey: ["campaignGroups"] });
      setNewEmail(""); setNewName(""); setNewGroups([]);
    },
  });

  function toggleGroup(list: string[], setList: (g: string[]) => void, g: string) {
    setList(list.includes(g) ? list.filter(x => x !== g) : [...list, g]);
  }

  const groups = groupsQuery.data?.groups ?? [];
  const estimatedReach = groups
    .filter(g => selectedGroups.includes(g.group))
    .reduce((sum, g) => sum + g.count, 0);

  return (
    <>
      <Topbar
        breadcrumb="Leadership / Announcements"
        title={<>Announce an <span className="text-brand">Achievement</span></>}
      />

      <div className="p-4 sm:p-8 pb-20 space-y-5">
        {/* ── Compose ──────────────────────────────────────────────────────── */}
        <div className="card-base p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink-mute">
              Draft
            </div>
            <button
              onClick={() => suggestMutation.mutate()}
              disabled={suggestMutation.isPending || selectedGroups.length === 0}
              className="flex items-center gap-1.5 text-[11px] font-medium text-brand disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {suggestMutation.isPending
                ? <><Loader2 size={12} className="animate-spin" /> Drafting…</>
                : <><Sparkles size={12} /> Suggest from Knowledge Base</>}
            </button>
          </div>

          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Subject line"
            className="w-full mb-2.5 text-[13px] font-medium px-3 py-2 rounded-lg border border-line-soft bg-surface-2 text-ink placeholder:text-ink-mute focus:outline-none focus:border-brand transition-colors"
          />
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={6}
            placeholder="Write the announcement…"
            className="w-full mb-3 text-[12px] leading-relaxed px-3 py-2.5 rounded-lg border border-line-soft bg-surface-2 text-ink placeholder:text-ink-mute focus:outline-none focus:border-brand transition-colors resize-none"
          />

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => { addFiles(e.target.files); e.target.value = ""; }}
          />
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border border-line text-ink-2 hover:border-brand hover:text-brand transition-colors"
            >
              <Paperclip size={11} /> Attach files
            </button>
            {files.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] bg-surface-2 border border-line-soft text-ink-2"
              >
                <FileText size={11} className="text-ink-mute" />
                <span className="max-w-[160px] truncate">{f.name}</span>
                <button onClick={() => removeFile(i)} className="text-ink-mute hover:text-danger">
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>

          <div className="font-mono text-[10px] uppercase tracking-widest text-ink-mute mb-2">
            Target Groups
          </div>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {groups.map(g => (
              <button
                key={g.group}
                onClick={() => toggleGroup(selectedGroups, setSelectedGroups, g.group)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
                  selectedGroups.includes(g.group)
                    ? "bg-brand text-white border-brand"
                    : "bg-surface text-ink-2 border-line hover:border-brand hover:text-brand"
                )}
              >
                {GROUP_LABELS[g.group] ?? g.group} <span className="opacity-70">({g.count})</span>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-ink-mute font-mono">
              {selectedGroups.length > 0
                ? `Up to ${estimatedReach} recipient${estimatedReach === 1 ? "" : "s"} (deduped at send time)`
                : "Select at least one group"}
            </span>
            <button
              onClick={() => sendMutation.mutate()}
              disabled={sendMutation.isPending || !subject.trim() || !body.trim() || selectedGroups.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-white text-[12px] font-medium disabled:opacity-50 transition-opacity"
            >
              {sendMutation.isPending
                ? <><Loader2 size={13} className="animate-spin" /> Sending…</>
                : <><Send size={13} /> Send Campaign</>}
            </button>
          </div>
          {sendMutation.isError && (
            <div className="text-[10px] text-red-400 font-mono mt-2">
              ✗ {(sendMutation.error as Error)?.message || "Failed — check backend"}
            </div>
          )}
        </div>

        {/* ── Last send result ─────────────────────────────────────────────── */}
        {lastResult && (
          <div className={cn(
            "rounded-lg border p-4",
            lastResult.failed_count === 0 ? "bg-emerald-500/8 border-emerald-500/25" : "bg-amber-500/8 border-amber-500/25"
          )}>
            <div className="text-[12px] font-medium text-ink mb-1">
              Sent "{lastResult.subject}" — {lastResult.sent_count}/{lastResult.recipient_count} delivered
            </div>
            <button onClick={() => setLastResult(null)} className="text-[10px] text-ink-mute hover:text-ink">
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* ── Subscribers ──────────────────────────────────────────────── */}
          <div className="card-base p-4">
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-mute mb-3">
              <Users size={12} /> Subscribers ({subsQuery.data?.subscribers.length ?? 0})
            </div>

            <div className="space-y-1.5 max-h-64 overflow-y-auto mb-4">
              {(subsQuery.data?.subscribers ?? []).map(s => (
                <div key={s.subscriber_id} className="flex items-center justify-between px-2.5 py-1.5 rounded bg-surface-2 border border-line-soft">
                  <div className="min-w-0">
                    <div className="text-[11px] text-ink truncate">{s.name}</div>
                    <div className="text-[10px] text-ink-mute font-mono truncate">{s.email}</div>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end shrink-0 ml-2">
                    {s.groups.slice(0, 2).map(g => (
                      <span key={g} className="font-mono text-[9px] px-1.5 py-px rounded bg-brand/10 text-brand border border-brand/20">
                        {GROUP_LABELS[g] ?? g}
                      </span>
                    ))}
                    {s.groups.length > 2 && <span className="text-[9px] text-ink-mute">+{s.groups.length - 2}</span>}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-line-soft pt-3 space-y-2">
              <div className="font-mono text-[9px] uppercase tracking-widest text-ink-mute">Add Subscriber</div>
              <input
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full text-[11px] px-2.5 py-1.5 rounded border border-line-soft bg-surface-2 text-ink placeholder:text-ink-mute focus:outline-none focus:border-brand"
              />
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Name (optional)"
                className="w-full text-[11px] px-2.5 py-1.5 rounded border border-line-soft bg-surface-2 text-ink placeholder:text-ink-mute focus:outline-none focus:border-brand"
              />
              <div className="flex flex-wrap gap-1">
                {groups.map(g => (
                  <button
                    key={g.group}
                    onClick={() => toggleGroup(newGroups, setNewGroups, g.group)}
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[9px] font-mono border transition-colors",
                      newGroups.includes(g.group)
                        ? "bg-brand text-white border-brand"
                        : "bg-surface text-ink-2 border-line"
                    )}
                  >
                    {GROUP_LABELS[g.group] ?? g.group}
                  </button>
                ))}
              </div>
              <button
                onClick={() => addSubMutation.mutate()}
                disabled={addSubMutation.isPending || !newEmail.trim() || newGroups.length === 0}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-2 border border-line-soft text-ink text-[11px] font-medium disabled:opacity-50"
              >
                <Plus size={11} /> Add
              </button>
            </div>
          </div>

          {/* ── History ──────────────────────────────────────────────────── */}
          <div className="card-base p-4">
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink-mute mb-3">
              Past Campaigns
            </div>
            {historyQuery.isLoading && (
              <div className="text-[11px] text-ink-mute text-center py-6">Loading…</div>
            )}
            {!historyQuery.isLoading && (historyQuery.data?.campaigns.length ?? 0) === 0 && (
              <div className="text-[11px] text-ink-mute text-center py-6">
                No campaigns sent yet.
              </div>
            )}
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {(historyQuery.data?.campaigns ?? []).map(c => (
                <CampaignHistoryItem key={c.campaign_id} campaign={c} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
