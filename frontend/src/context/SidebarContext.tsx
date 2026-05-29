import { createContext, useContext } from "react";

interface SidebarCtx {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
}

export const SidebarContext = createContext<SidebarCtx>({
  isOpen: false,
  toggle: () => {},
  close: () => {},
});

export const useSidebar = () => useContext(SidebarContext);
