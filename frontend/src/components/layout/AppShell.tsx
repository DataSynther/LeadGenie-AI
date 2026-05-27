import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  return (
    <div className="grid grid-cols-[240px_1fr] h-screen overflow-hidden">
      <Sidebar />
      <main className="overflow-y-auto bg-canvas">
        <Outlet />
      </main>
    </div>
  );
}
