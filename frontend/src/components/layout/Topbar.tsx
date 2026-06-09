import { type ReactNode } from "react";
import { Menu } from "lucide-react";
import { useSidebar } from "../../context/SidebarContext";

interface TopbarProps {
  breadcrumb: string;
  title: ReactNode;
  right?: ReactNode;
}

export function Topbar({ breadcrumb, title, right }: TopbarProps) {
  const { toggle, isCollapsed } = useSidebar();

  return (
    <div className="sticky top-0 z-10 bg-canvas border-b border-line-soft px-4 sm:px-8 py-4 flex items-center gap-3 justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <button
          className="md:hidden flex-shrink-0 text-ink-2 hover:text-ink"
          onClick={toggle}
          aria-label="Open menu"
        >
          <Menu size={20} strokeWidth={2} />
        </button>
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute hidden sm:block">
            {breadcrumb}
          </div>
          <div className="font-serif text-display-lg text-ink">{title}</div>
        </div>
      </div>
      <div className="flex gap-1.5 sm:gap-2.5 items-center flex-shrink-0">
        {right}
      </div>
    </div>
  );
}
