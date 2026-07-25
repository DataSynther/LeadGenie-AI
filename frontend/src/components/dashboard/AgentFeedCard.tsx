import { useQuery } from "@tanstack/react-query";
import { api, type AgentFeedEvent } from "../../lib/api";
import { cn } from "../../lib/utils";

const AGENT_STYLES: Record<AgentFeedEvent["agent"], string> = {
  research: "text-info bg-info-tint",
  outreach: "text-brand bg-brand-soft",
  reply: "text-magenta-dark bg-magenta/10",
  gov: "text-gold-dark bg-gold-tint",
  schedule: "text-brand bg-brand-soft",
};

function renderMessage(text: string) {
  // Highlight quoted-style text (between strong markers if backend uses them)
  // For now just render as-is. Backend's messages already have plain text.
  return text;
}

export function AgentFeedCard() {
  const { data: events = [] } = useQuery({
    queryKey: ["agentFeed"],
    queryFn: api.recentAgentEvents,
    refetchInterval: 8000,
  });

  return (
    <div className="card-base">
      <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between">
        <div className="font-serif text-display-md text-ink">
          Agent <span className="text-brand">activity</span>
        </div>
        <div className="label-mono">Live</div>
      </div>
      <div className="px-5 pt-2 pb-5">
        <div className="flex flex-col max-h-[300px] overflow-y-auto">
          {events.map((event, i) => (
            <div
              key={i}
              className={cn(
                "grid grid-cols-[80px_100px_1fr] gap-3 py-3 items-start",
                i < events.length - 1 && "border-b border-line-soft",
              )}
            >
              <div className="font-mono text-[10px] text-ink-mute pt-0.5">
                {event.timestamp}
              </div>
              <div
                className={cn(
                  "font-mono text-[10px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded font-semibold w-fit",
                  AGENT_STYLES[event.agent],
                )}
              >
                {event.agent}
              </div>
              <div className="text-xs text-ink-2 leading-relaxed">
                {renderMessage(event.message)}
              </div>
            </div>
          ))}
          {events.length === 0 && (
            <div className="py-8 text-center text-ink-mute text-xs">
              No events yet — agents are warming up...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
