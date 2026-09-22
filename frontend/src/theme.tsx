import { createContext, useContext, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Monitor, Moon, Sun } from "lucide-react";

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

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { preference, change } = useContext(ThemeContext);
  return (
    <div
      className={`theme-switcher ${compact ? "compact" : ""}`}
      role="group"
      aria-label="Color theme"
    >
      {(
        [
          { value: "light", label: "Light", Icon: Sun },
          { value: "dark", label: "Dark", Icon: Moon },
          { value: "system", label: "System", Icon: Monitor },
        ] as const
      ).map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={`${label} theme`}
          title={`${label} theme`}
          aria-pressed={preference === value}
          onClick={() => change(value)}
        >
          <Icon size={16} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
