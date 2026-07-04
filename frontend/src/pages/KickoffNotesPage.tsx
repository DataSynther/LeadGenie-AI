import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Target, Lightbulb, HelpCircle, Loader2, FileText } from "lucide-react";
import { Topbar } from "../components/layout/Topbar";
import { api, type KickoffNoteRecord } from "../lib/api";
import { cn } from "../lib/utils";

function NoteListItem({
  note, selected, onClick,
}: { note: KickoffNoteRecord; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2.5 rounded-md border transition-colors",
        selected
          ? "bg-brand-soft border-brand/25"
          : "bg-surface border-line-soft hover:border-line"
      )}
    >
      <div className="text-[12px] font-medium text-ink truncate">{note.company_name}</div>
      <div className="text-[10px] text-ink-mute font-mono mt-0.5">
        {new Date(note.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
      </div>
      <div className="text-[10px] text-ink-2 truncate mt-1">{note.note.headline}</div>
    </button>
  );
}

function NoteDetail({ record }: { record: KickoffNoteRecord }) {
  const { note } = record;
  return (
    <div className="card-base p-6 space-y-5">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-brand mb-1.5">
          {record.company_name} · {new Date(record.created_at).toLocaleDateString()}
        </div>
        <div className="font-serif text-[20px] text-ink leading-snug">{note.headline}</div>
      </div>

      <p className="text-[13px] text-ink-2 leading-relaxed">{note.company_snapshot}</p>

      {note.likely_pain_points?.length > 0 && (
        <section>
          <div className="flex items-center gap-1.5 label-mono text-ink mb-2">
            <Target size={12} /> Likely Pain Points
          </div>
          <ul className="space-y-1.5">
            {note.likely_pain_points.map((p, i) => (
              <li key={i} className="text-[12px] text-ink flex gap-2">
                <span className="text-brand shrink-0">•</span>{p}
              </li>
            ))}
          </ul>
        </section>
      )}

      {note.relevant_ganit_work?.length > 0 && (
        <section>
          <div className="flex items-center gap-1.5 label-mono text-ink mb-2">
            <Sparkles size={12} /> Relevant Ganit Work
          </div>
          <div className="space-y-2">
            {note.relevant_ganit_work.map((w, i) => (
              <div key={i} className="rounded-md border border-line-soft bg-surface-2 p-3">
                <div className="text-[12px] text-ink leading-relaxed">{w.claim}</div>
                <div className="text-[11px] text-ink-mute mt-1.5 italic">{w.why_relevant}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {note.talking_points?.length > 0 && (
        <section>
          <div className="flex items-center gap-1.5 label-mono text-ink mb-2">
            <Lightbulb size={12} /> Talking Points
          </div>
          <ul className="space-y-1.5">
            {note.talking_points.map((p, i) => (
              <li key={i} className="text-[12px] text-ink flex gap-2">
                <span className="text-gold shrink-0">{i + 1}.</span>{p}
              </li>
            ))}
          </ul>
        </section>
      )}

      {note.open_questions?.length > 0 && (
        <section>
          <div className="flex items-center gap-1.5 label-mono text-ink mb-2">
            <HelpCircle size={12} /> Open Questions
          </div>
          <ul className="space-y-1.5">
            {note.open_questions.map((q, i) => (
              <li key={i} className="text-[12px] text-ink-2 flex gap-2">
                <span className="text-ink-mute shrink-0">?</span>{q}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function KickoffNotesPage() {
  const queryClient = useQueryClient();
  const [domain, setDomain] = useState("");
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const notesQuery = useQuery({
    queryKey: ["kickoffNotes"],
    queryFn: api.listKickoffNotes,
  });

  const generateMutation = useMutation({
    mutationFn: () => api.generateKickoffNote(domain.trim(), name.trim() || undefined),
    onSuccess: (record) => {
      queryClient.invalidateQueries({ queryKey: ["kickoffNotes"] });
      setSelectedId(record.note_id);
      setDomain("");
      setName("");
    },
  });

  const notes = notesQuery.data?.notes ?? [];
  const selected = notes.find(n => n.note_id === selectedId) ?? generateMutation.data ?? null;

  return (
    <>
      <Topbar
        breadcrumb="Leadership / Kickoff Notes"
        title={<>Kickoff <em className="text-brand italic">Notes</em></>}
      />

      <div className="p-4 sm:p-8 pb-20 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
        {/* Left column — generate + list */}
        <div className="space-y-4">
          <div className="card-base p-4">
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink-mute mb-3">
              Generate Note
            </div>
            <label className="block mb-2.5">
              <div className="text-[10px] text-ink-2 mb-1">Company domain</div>
              <input
                value={domain}
                onChange={e => setDomain(e.target.value)}
                onKeyDown={e => e.key === "Enter" && domain.trim() && generateMutation.mutate()}
                placeholder="acme.com"
                className="w-full text-[12px] px-3 py-2 rounded-lg border border-line-soft bg-surface-2 text-ink placeholder:text-ink-mute focus:outline-none focus:border-brand transition-colors"
              />
            </label>
            <label className="block mb-3">
              <div className="text-[10px] text-ink-2 mb-1">Company name (optional)</div>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Acme Corp"
                className="w-full text-[12px] px-3 py-2 rounded-lg border border-line-soft bg-surface-2 text-ink placeholder:text-ink-mute focus:outline-none focus:border-brand transition-colors"
              />
            </label>
            <button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending || !domain.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-brand text-white text-[12px] font-medium disabled:opacity-50 transition-opacity"
            >
              {generateMutation.isPending
                ? <><Loader2 size={13} className="animate-spin" /> Researching & drafting…</>
                : <><FileText size={13} /> Generate Note</>}
            </button>
            {generateMutation.isError && (
              <div className="text-[10px] text-red-400 font-mono mt-2">
                ✗ {(generateMutation.error as Error)?.message || "Failed — check backend"}
              </div>
            )}
          </div>

          <div className="card-base overflow-hidden">
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink-mute px-4 py-3 border-b border-line-soft">
              Past Notes
            </div>
            {notesQuery.isLoading && (
              <div className="px-4 py-6 text-[11px] text-ink-mute text-center">Loading…</div>
            )}
            {!notesQuery.isLoading && notes.length === 0 && (
              <div className="px-4 py-6 text-[11px] text-ink-mute text-center">
                No notes yet. Generate one above ahead of your next kickoff.
              </div>
            )}
            <div className="p-2 space-y-1.5 max-h-[60vh] overflow-y-auto">
              {notes.map(n => (
                <NoteListItem
                  key={n.note_id}
                  note={n}
                  selected={n.note_id === selectedId}
                  onClick={() => setSelectedId(n.note_id)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right column — detail */}
        <div>
          {selected ? (
            <NoteDetail record={selected} />
          ) : (
            <div className="card-base p-10 flex flex-col items-center justify-center gap-2 text-center">
              <FileText size={28} className="text-ink-mute/40" />
              <div className="text-[12px] text-ink-mute">
                Generate a note or pick one from the list to see the kickoff brief.
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
