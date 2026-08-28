import { useTheme } from "../lib/useTheme";
import { THEME_NAMES } from "../lib/theme";

function SunIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
    </svg>
  );
}

/**
 * Switches between Snack Pack and Night Snack. Shows the theme you would get,
 * not the one you are in — the icon is the destination.
 */
export default function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      title={`Switch to ${THEME_NAMES[next]}`}
      aria-label={`Switch to ${next} mode (${THEME_NAMES[next]})`}
      className={`min-h-11 min-w-11 flex items-center justify-center rounded-full border-card border-line bg-surface text-ink transition-transform active:translate-x-px active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-page ${className ?? ""}`}
    >
      {next === "dark" ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
