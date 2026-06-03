import { useState } from "react";
import { Topbar } from "../components/layout/Topbar";
import { ConvListItem } from "../components/conversations/ConvListItem";
import { ConvThread } from "../components/conversations/ConvThread";
import { conversations } from "../data/conversations";

export function ConversationsPage() {
  const [selectedId, setSelectedId] = useState(conversations[0].id);
  const selected = conversations.find((c) => c.id === selectedId) || conversations[0];

  return (
    <>
      <Topbar
        breadcrumb="Workspace / Conversations"
        title={<>Active <span className="text-brand font-semibold">Conversations</span></>}
        right={
          <>
            <button className="btn-ghost">All</button>
            <button className="btn-ghost">Objections</button>
            <button className="btn-ghost">Booked</button>
          </>
        }
      />

      <div className="p-8 pb-20">
        <div className="grid grid-cols-[340px_1fr] card-base h-[calc(100vh-200px)]">
          <div className="border-r border-line-soft overflow-y-auto bg-surface-2">
            {conversations.map((conv) => (
              <ConvListItem
                key={conv.id}
                conv={conv}
                selected={conv.id === selectedId}
                onSelect={setSelectedId}
              />
            ))}
          </div>
          <ConvThread conv={selected} />
        </div>
      </div>
    </>
  );
}
