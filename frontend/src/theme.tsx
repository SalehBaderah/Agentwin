import { createContext, useContext, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Monitor, Moon, Sun } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

type Preference = "dark" | "light" | "system";
const ThemeContext = createContext<{
  preference: Preference;
  change: (value: Preference) => void;
}>({ preference: "system", change: () => {} });
const valid = (value: string | null): Preference =>
  value === "dark" || value === "light" ? value : "system";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<Preference>(() => {
    try {
      return valid(localStorage.getItem("agentwin-theme"));
    } catch {
      return "system";
    }
  });
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const theme =
        preference === "system"
          ? media.matches
            ? "dark"
            : "light"
          : preference;
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", theme === "dark" ? "#0B0B0C" : "#F4F5F7");
    };
    apply();
    media.addEventListener("change", apply);
    const sync = (event: StorageEvent) => {
      if (event.key === "agentwin-theme") setPreference(valid(event.newValue));
    };
    window.addEventListener("storage", sync);
    return () => {
      media.removeEventListener("change", apply);
      window.removeEventListener("storage", sync);
    };
  }, [preference]);
  const change = (value: Preference) => {
    const update = () => {
      setPreference(value);
      try {
        localStorage.setItem("agentwin-theme", value);
      } catch {
        /* Session preference still works when storage is blocked. */
      }
    };
    if (
      document.startViewTransition &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      document.startViewTransition(() => flushSync(update));
    else update();
  };
  return (
    <ThemeContext.Provider value={{ preference, change }}>
      {children}
    </ThemeContext.Provider>
  );
}

const themeOptions = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const;

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { preference, change } = useContext(ThemeContext);
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border bg-card p-1" role="group" aria-label="Color theme">
      {themeOptions.map(({ value, label, Icon }) => (
        <Toggle
          key={value}
          size="sm"
          pressed={preference === value}
          onPressedChange={() => change(value)}
          aria-label={`${label} theme`}
          title={`${label} theme`}
          className={cn("rounded-[10px] border border-transparent text-muted-foreground data-[state=on]:border-input data-[state=on]:bg-secondary data-[state=on]:text-foreground data-[state=on]:shadow-sm", compact ? "size-8 min-w-0 px-0" : "h-10 gap-2 px-3.5 text-[13px] font-normal")}
        >
          <Icon />
          {!compact && <span>{label}</span>}
        </Toggle>
      ))}
    </div>
  );
}
