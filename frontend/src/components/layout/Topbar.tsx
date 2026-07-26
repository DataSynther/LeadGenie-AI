import { type ReactNode } from "react";
import { Menu } from "lucide-react";
import { useSidebar } from "../../context/SidebarContext";

interface TopbarProps {
  breadcrumb: string;
  title: ReactNode;
  right?: ReactNode;
}

export function Topbar({ breadcrumb, title, right }: TopbarProps) {
  const { toggle } = useSidebar();

  return (
    <div className="sticky top-0 z-10 bg-brand-soft border-b border-brand/15 px-4 sm:px-8 py-5 flex items-center gap-3 justify-between shadow-[0_1px_0_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-3 min-w-0">
        <button
          className="md:hidden flex-shrink-0 text-ink-2 hover:text-ink"
          onClick={toggle}
          aria-label="Open menu"
        >
          <Menu size={20} strokeWidth={2} />
        </button>
        <div className="flex flex-col gap-1 min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-brand-dark hidden sm:block font-semibold">
            {breadcrumb}
          </div>
          <div className="font-sans text-display-lg text-ink">{title}</div>
        </div>
      </div>
      <div className="flex gap-1.5 sm:gap-2.5 items-center flex-shrink-0">
        {right}
      </div>
    </div>
  );
}
