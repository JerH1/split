import { useEffect, useRef, useState } from "react";
import { useLocale } from "../lib/i18n/context";
import { LOCALES, Locale } from "../lib/i18n/locales";

function GlobeIcon() {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" />
    </svg>
  );
}

/**
 * Picks the app language.
 *
 * A popover rather than a cycling button: four languages is too many to step
 * through, and someone who has landed in a language they cannot read needs to
 * see their own listed rather than tap hopefully until it appears. For the same
 * reason each option is written in its own language and the globe carries no
 * flag — a flag names a country, and none of these languages belongs to one.
 */
export default function LanguagePicker({
  className,
  buttonClassName,
}: {
  /** Positions the picker. The wrapper is the popover's anchor, so it keeps
      `relative` whatever else is added here. */
  className?: string;
  /** Restyles the trigger itself — the session header wants it borderless,
      the way ThemeToggle is there. */
  buttonClassName?: string;
}) {
  const { locale, setLocale, t } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function choose(next: Locale) {
    setLocale(next);
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={t("common.language")}
        title={t("common.language")}
        className={`flex min-h-11 min-w-11 items-center justify-center rounded-full border-card border-line bg-surface text-ink transition-transform active:translate-x-px active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-page ${buttonClassName ?? ""}`}
      >
        <GlobeIcon />
      </button>

      {isOpen && (
        <div
          role="group"
          aria-label={t("common.chooseLanguage")}
          className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-card border-card border-line bg-surface shadow-hard-lg"
        >
          {LOCALES.map((option, index) => (
            <button
              key={option.id}
              type="button"
              lang={option.tag}
              onClick={() => choose(option.id)}
              aria-pressed={option.id === locale}
              className={`flex min-h-12 w-full items-center justify-between px-3.5 text-left font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus ${
                index > 0 ? "border-t-2 border-line-soft" : ""
              } ${
                option.id === locale
                  ? "bg-accent text-accent-ink"
                  : "bg-surface text-ink"
              }`}
            >
              <span>{option.endonym}</span>
              {option.id === locale && (
                <span aria-hidden="true" className="text-sm">
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
