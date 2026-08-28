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

/** The browser/OS chrome colour per theme, mirroring --page in index.css. */
const CHROME_COLOR: Record<ResolvedTheme, string> = {
  light: "#FFF6E9",
  dark: "#08070C",
};

export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;

  // index.html ships two media-scoped theme-color tags as the pre-JS fallback.
  // Once the choice is known it can disagree with the OS, so both are set to
  // the resolved colour and whichever the browser matches is correct.
  const color = CHROME_COLOR[theme];
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute("content", color);
  }
}
