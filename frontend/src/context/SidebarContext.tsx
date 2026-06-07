import { createContext, useContext } from "react";

interface SidebarCtx {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
  isCollapsed: boolean;
  toggleCollapse: () => void;
}

export const SidebarContext = createContext<SidebarCtx>({
  isOpen: false,
  toggle: () => {},
  close: () => {},
  isCollapsed: false,
  toggleCollapse: () => {},
});

export const useSidebar = () => useContext(SidebarContext);
