import { useState } from "react";
import { Outlet } from "react-router-dom";
import { PanelLeftOpen } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { SidebarContext } from "../../context/SidebarContext";

export function AppShell() {
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "true",
  );

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      localStorage.setItem("sidebar-collapsed", String(!prev));
      return !prev;
    });
  };

  return (
    <SidebarContext.Provider
      value={{
        isOpen,
        toggle: () => setIsOpen((p) => !p),
        close: () => setIsOpen(false),
        isCollapsed,
        toggleCollapse,
      }}
    >
      <div className="flex h-screen overflow-hidden bg-canvas">
        {isOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/50 md:hidden"
            onClick={() => setIsOpen(false)}
          />
        )}
        <Sidebar />

        {/* Floating re-open tab — visible only when sidebar is collapsed on desktop */}
        {isCollapsed && (
          <button
            onClick={toggleCollapse}
            className="hidden md:flex fixed top-1/2 -translate-y-1/2 left-0 z-40 items-center justify-center w-5 h-14 bg-surface border border-line-soft border-l-0 rounded-r-lg text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors shadow-md"
            aria-label="Open sidebar"
          >
            <PanelLeftOpen size={13} strokeWidth={2} />
          </button>
        )}

        <main className="flex-1 overflow-y-auto bg-canvas min-w-0">
          <Outlet />
        </main>
      </div>
    </SidebarContext.Provider>
  );
}
