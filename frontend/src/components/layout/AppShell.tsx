import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { SidebarContext } from "../../context/SidebarContext";

export function AppShell() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <SidebarContext.Provider
      value={{
        isOpen,
        toggle: () => setIsOpen((p) => !p),
        close: () => setIsOpen(false),
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
        <main className="flex-1 overflow-y-auto bg-canvas min-w-0">
          <Outlet />
        </main>
      </div>
    </SidebarContext.Provider>
  );
}
