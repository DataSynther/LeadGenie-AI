import { type ReactNode } from "react";

interface TopbarProps {
  breadcrumb: string;
  title: ReactNode;
  right?: ReactNode;
}

export function Topbar({ breadcrumb, title, right }: TopbarProps) {
  return (
    <div className="sticky top-0 z-10 bg-canvas border-b border-line-soft px-8 py-4 flex items-center justify-between">
      <div className="flex flex-col gap-0.5">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute">
          {breadcrumb}
        </div>
        <div className="font-serif text-display-lg text-ink">{title}</div>
      </div>
      {right && <div className="flex gap-2.5 items-center">{right}</div>}
    </div>
  );
}
