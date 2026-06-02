import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Send, Smartphone } from "lucide-react";
import { Topbar } from "../components/layout/Topbar";
import { api, type WhatsAppConversation } from "../lib/api";
import { cn } from "../lib/utils";

function formatTime(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: string) {
  return status === "awaiting_human" ? "Awaiting Response" : "Human Responded";
}

export function WhatsAppInboxPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  const inbox = useQuery({
    queryKey: ["whatsappConversations"],
    queryFn: api.whatsappConversations,
    refetchInterval: 30_000,
  });

  const conversations = inbox.data?.conversations ?? [];
  const selected = useMemo(
    () => conversations.find((conv) => conv.lead_id === selectedId) ?? conversations[0],
    [conversations, selectedId],
  );

  useEffect(() => {
    if (!selectedId && conversations[0]) {
      setSelectedId(conversations[0].lead_id);
    }
  }, [conversations, selectedId]);

  const openConversation = useMutation({
    mutationFn: (leadId: string) => api.openWhatsAppConversation(leadId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsappConversations"] }),
  });

  const sendReply = useMutation({
    mutationFn: () => api.sendWhatsAppReply(selected!.lead_id, reply.trim()),
    onSuccess: () => {
      setReply("");
      queryClient.invalidateQueries({ queryKey: ["whatsappConversations"] });
    },
  });

  function selectConversation(conv: WhatsAppConversation) {
    setSelectedId(conv.lead_id);
    setReply("");
    if (conv.unread) {
      openConversation.mutate(conv.lead_id);
    }
  }

  return (
    <>
      <Topbar
        breadcrumb="Workspace / WhatsApp Inbox"
        title={<>WhatsApp <em className="text-brand italic">Inbox</em></>}
        right={
          inbox.data?.unread_count ? (
            <span className="rounded-md bg-danger text-white px-2.5 py-1 text-[11px] font-mono font-semibold">
              {inbox.data.unread_count} New WhatsApp Reply
            </span>
          ) : (
            <span className="label-mono hidden sm:block">Human controlled</span>
          )
        }
      />

      <div className="p-4 sm:p-8 pb-20">
        <div className="card-base h-[calc(100vh-170px)] min-h-[560px] grid grid-cols-1 lg:grid-cols-[360px_1fr]">
          <div className="border-b lg:border-b-0 lg:border-r border-line-soft bg-surface-2 overflow-y-auto">
            <div className="px-5 py-4 border-b border-line-soft bg-surface">
              <div className="label-mono text-ink">Awaiting Human Response</div>
              <div className="text-[12px] text-ink-2 mt-1">
                {conversations.length} active WhatsApp conversation{conversations.length === 1 ? "" : "s"}
              </div>
            </div>

            {inbox.isLoading && (
              <div className="py-16 text-center text-ink-mute text-sm font-mono">
                Loading WhatsApp replies...
              </div>
            )}

            {inbox.error && (
              <div className="m-4 rounded-md border border-danger/20 bg-danger-tint p-4 text-danger text-sm">
                {(inbox.error as Error).message}
              </div>
            )}

            {inbox.data?.sync?.error && (
              <div className="m-4 rounded-md border border-gold/20 bg-gold-tint p-4">
                <div className="text-[12px] font-semibold text-gold-dark">
                  Render mailbox sync failed
                </div>
                <div className="mt-1 font-mono text-[10px] leading-relaxed text-gold-dark">
                  {inbox.data.sync.error}
                </div>
              </div>
            )}

            {inbox.data?.sync && !inbox.data.sync.error && conversations.length === 0 && (
              <div className="m-4 rounded-md border border-line-soft bg-surface p-4">
                <div className="text-[12px] font-semibold text-ink">
                  Render mailbox checked
                </div>
                <div className="mt-1 font-mono text-[10px] leading-relaxed text-ink-2">
                  fetched={inbox.data.sync.fetched} imported={inbox.data.sync.imported} skipped={inbox.data.sync.skipped}
                </div>
              </div>
            )}

            {!inbox.isLoading && conversations.length === 0 && (
              <div className="py-16 px-6 text-center">
                <MessageCircle size={30} className="mx-auto text-ink-mute mb-3" strokeWidth={1.5} />
                <div className="text-sm text-ink-2">No WhatsApp replies are awaiting a human.</div>
              </div>
            )}

            {conversations.map((conv) => (
              <button
                key={conv.lead_id}
                onClick={() => selectConversation(conv)}
                className={cn(
                  "w-full text-left px-5 py-4 border-b border-line-soft transition-colors",
                  selected?.lead_id === conv.lead_id ? "bg-brand-soft" : "bg-surface-2 hover:bg-surface",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-ink truncate">{conv.lead_name}</div>
                    <div className="text-[12px] text-brand font-medium truncate">{conv.company_name}</div>
                    <div className="font-mono text-[10px] text-ink-2 mt-1">Phone: {conv.phone || "unknown"}</div>
                  </div>
                  {conv.unread && <span className="mt-1 h-2 w-2 rounded-full bg-danger shrink-0" />}
                </div>
                <div className="mt-3 text-[12px] text-ink line-clamp-2">"{conv.last_message}"</div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] text-ink-mute">{formatTime(conv.updated_at)}</span>
                  <span className="rounded bg-gold-tint text-gold-dark px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]">
                    {statusLabel(conv.status)}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div className="flex min-h-0 flex-col bg-surface">
            {selected ? (
              <>
                <div className="px-6 py-5 border-b border-line-soft flex items-start justify-between gap-4">
                  <div>
                    <div className="font-serif text-[24px] leading-none text-ink">{selected.lead_name}</div>
                    <div className="text-[12px] text-brand font-medium mt-1">{selected.company_name}</div>
                    <div className="font-mono text-[10px] text-ink-2 mt-1 flex items-center gap-1.5">
                      <Smartphone size={11} />
                      {selected.phone || "unknown phone"}
                    </div>
                  </div>
                  <span className="rounded-md bg-gold-tint text-gold-dark border border-gold/20 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em]">
                    {statusLabel(selected.status)}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-canvas">
                  <div className="flex flex-col gap-3">
                    {selected.messages.map((message) => (
                      <div
                        key={`${message.timestamp}-${message.direction}`}
                        className={cn(
                          "max-w-[78%] rounded-md border px-4 py-3",
                          message.direction === "outbound"
                            ? "ml-auto bg-brand text-white border-brand"
                            : "mr-auto bg-surface text-ink border-line-soft",
                        )}
                      >
                        <div className="font-mono text-[9px] uppercase tracking-[0.1em] opacity-70 mb-1">
                          {message.direction === "outbound" ? "Admin" : "Lead"} / {formatTime(message.timestamp)}
                        </div>
                        <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{message.message}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-line-soft p-5 bg-surface">
                  {sendReply.error && (
                    <div className="mb-3 rounded-md border border-danger/20 bg-danger-tint p-3 text-danger text-xs font-mono">
                      {(sendReply.error as Error).message}
                    </div>
                  )}
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={4}
                    placeholder="Write a human reply..."
                    className="w-full resize-none rounded-md border border-line bg-surface px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-2 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-soft"
                  />
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => sendReply.mutate()}
                      disabled={!reply.trim() || sendReply.isPending}
                      className="btn-primary flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <Send size={13} />
                      {sendReply.isPending ? "Sending..." : "Send WhatsApp Reply"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-center text-ink-2">
                <div>
                  <MessageCircle size={34} className="mx-auto text-ink-mute mb-3" strokeWidth={1.5} />
                  <div className="text-sm">Open a WhatsApp conversation to respond.</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
