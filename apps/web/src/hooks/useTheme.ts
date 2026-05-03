import { useEffect, useMemo, useState } from "react";

export type ThemePreference = "dark" | "light" | "system";

const storageKey = "mergepilot.theme";

function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  const stored = window.localStorage.getItem(storageKey);
  return stored === "dark" || stored === "light" || stored === "system" ? stored : "system";
}

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(getStoredTheme);
  const [systemTheme, setSystemTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") {
      return "dark";
    }
    return getSystemTheme();
  });

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => setSystemTheme(getSystemTheme());
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const resolvedTheme = preference === "system" ? systemTheme : preference;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("no-transitions");
    root.dataset.theme = resolvedTheme;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.style.colorScheme = resolvedTheme;
    window.localStorage.setItem(storageKey, preference);

    root.offsetHeight;
    const frame = window.requestAnimationFrame(() => root.classList.remove("no-transitions"));
    return () => window.cancelAnimationFrame(frame);
  }, [preference, resolvedTheme]);

  return useMemo(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme]
  );
}
