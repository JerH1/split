/**
 * Theme preference: Snack Pack (light) or Night Snack (dark).
 *
 * "system" follows the OS. Whatever the choice resolves to is always written
 * to <html data-theme>, so the stylesheet only has to know about two concrete
 * themes. index.html does the same thing inline before first paint to avoid a
 * flash of the wrong theme.
 */

const STORAGE_KEY = "split_theme";

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_NAMES: Record<ResolvedTheme, string> = {
  light: "Snack Pack",
  dark: "Night Snack",
};

/** The stored choice, or "system" when nothing valid is stored. */
export function getStoredTheme(): ThemeChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark") return raw;
  } catch {
    // localStorage can fail in private browsing mode
  }
  return "system";
}

export function setStoredTheme(choice: ThemeChoice): void {
  try {
    if (choice === "system") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, choice);
    }
  } catch {
    // Silently fail - the theme still applies for this session
  }
}

export function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice === "system") return prefersDark() ? "dark" : "light";
  return choice;
}

export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
}
