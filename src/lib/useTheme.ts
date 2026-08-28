import { useCallback, useEffect, useState } from "react";
import {
  applyTheme,
  getStoredTheme,
  prefersDark,
  resolveTheme,
  setStoredTheme,
  ThemeChoice,
  ResolvedTheme,
} from "./theme";

/**
 * Reads the theme choice, keeps <html data-theme> in sync, and follows the OS
 * while the choice is still "system".
 *
 * Toggling always writes an explicit choice: once someone has picked a side,
 * the OS flipping at sunset shouldn't undo it.
 */
export function useTheme(): {
  choice: ThemeChoice;
  theme: ResolvedTheme;
  setChoice: (choice: ThemeChoice) => void;
  toggle: () => void;
} {
  const [choice, setChoiceState] = useState<ThemeChoice>(() =>
    getStoredTheme(),
  );
  const [systemDark, setSystemDark] = useState<boolean>(() => prefersDark());

  const theme: ResolvedTheme =
    choice === "system" ? (systemDark ? "dark" : "light") : choice;

  // Track the OS preference so a "system" choice stays live.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setStoredTheme(next);
    setChoiceState(next);
    applyTheme(resolveTheme(next));
  }, []);

  const toggle = useCallback(() => {
    setChoice(theme === "dark" ? "light" : "dark");
  }, [setChoice, theme]);

  return { choice, theme, setChoice, toggle };
}
