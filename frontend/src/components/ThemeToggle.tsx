import { Moon, Sun } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { cn } from "../lib/utils";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200",
        isDark ? "bg-brand" : "bg-line",
      )}
    >
      <span
        className={cn(
          "inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-surface shadow-sm transition-transform duration-200",
          isDark ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      >
        {isDark ? (
          <Moon size={10} className="text-brand" />
        ) : (
          <Sun size={10} className="text-ink-2" />
        )}
      </span>
    </button>
  );
}
