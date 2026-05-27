import { useQuery } from "@tanstack/react-query";
import { Topbar } from "../components/layout/Topbar";
import { StatusPill } from "../components/StatusPill";
import { StageChip } from "../components/pipeline/StageChip";
import { SignalPill } from "../components/pipeline/SignalPill";
import { api } from "../lib/api";

export function PipelinePage() {
  const { data: pipeline = [], isLoading } = useQuery({
    queryKey: ["pipeline"],
    queryFn: api.pipeline,
  });

  return (
    <>
      <Topbar
        breadcrumb="Workspace / Pipeline"
        title={
          <>
            Active <em className="text-brand italic">Pipeline</em>
          </>
        }
        right={
          <>
            <StatusPill>{pipeline.length} prospects</StatusPill>
            <button className="btn-ghost">Filter</button>
            <button className="btn-primary">+ Add</button>
          </>
        }
      />

      <div className="p-8 pb-20">
        <div className="card-base overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr>
                {[
                  "Prospect",
                  "Company",
                  "Signals",
                  "Stage",
                  "Last touch",
                  "Reply chance",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-5 py-3.5 bg-surface-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-2 font-medium border-b border-line-soft"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-8 text-center text-ink-mute"
                  >
                    Loading...
                  </td>
                </tr>
              )}
              {pipeline.map((p) => (
                <tr
                  key={p.lead_id}
                  className="cursor-pointer hover:bg-surface-2 transition-colors"
                >
                  <td className="px-5 py-4 border-b border-line-soft text-ink font-medium">
                    {p.name}
                  </td>
                  <td className="px-5 py-4 border-b border-line-soft text-ink-2">
                    {p.company.name} · {p.title}
                  </td>
                  <td className="px-5 py-4 border-b border-line-soft">
                    <div className="flex gap-1 flex-wrap">
                      {p.signals.map((s, i) => (
                        <SignalPill key={i} signal={s} />
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-4 border-b border-line-soft">
                    <StageChip stage={p.stage} />
                  </td>
                  <td className="px-5 py-4 border-b border-line-soft text-ink-2 font-mono">
                    {p.stage === "researching" || p.stage === "new"
                      ? "—"
                      : "12m ago"}
                  </td>
                  <td className="px-5 py-4 border-b border-line-soft">
                    <span className="font-mono text-brand font-semibold">
                      {p.stage === "meeting_booked"
                        ? "—"
                        : `${Math.round(p.reply_probability * 100)}%`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
