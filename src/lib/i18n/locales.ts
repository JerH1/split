/**
 * The languages SplitSnax speaks, and how a visitor ends up in one of them.
 *
 * The resolved locale is always written to <html lang>, by the inline script in
 * index.html before first paint and by useLocale() thereafter — the same shape
 * as the theme. `lang` is not decoration: it decides which voice a screen
 * reader uses, and which font the browser reaches for on a Thai run.
 */

const STORAGE_KEY = "split_locale";

export type Locale = "en" | "es" | "de" | "th";

export interface LocaleInfo {
  id: Locale;
  /** The language's own name for itself. Nobody looks for "Spanish" in a
      Spanish menu, so the picker never translates these. */
  endonym: string;
  /** BCP 47 tag for <html lang>, Intl.PluralRules and date formatting. */
  tag: string;
}

export const LOCALES: readonly LocaleInfo[] = [
  { id: "en", endonym: "English", tag: "en" },
  { id: "es", endonym: "Español", tag: "es" },
  { id: "de", endonym: "Deutsch", tag: "de" },
  { id: "th", endonym: "ไทย", tag: "th" },
];

export const DEFAULT_LOCALE: Locale = "en";

export function localeInfo(locale: Locale): LocaleInfo {
  return LOCALES.find((l) => l.id === locale) ?? LOCALES[0];
}

/** Coerce anything — stale storage, a hand-edited value — into a real locale. */
export function normalizeLocale(value: unknown): Locale | null {
  return LOCALES.some((l) => l.id === value) ? (value as Locale) : null;
}

/**
 * The best supported match for the languages the browser asks for.
 *
 * Matched on the primary subtag only: "es-419", "es-MX" and "es" all want
 * Spanish, and shipping one Spanish is the honest option when the differences
 * between them are not ones this app expresses.
 */
export function detectLocale(
  languages: readonly string[] = typeof navigator !== "undefined"
    ? (navigator.languages ?? [navigator.language])
    : [],
): Locale {
  for (const language of languages) {
    if (!language) continue;
    const base = language.toLowerCase().split("-")[0];
    const match = normalizeLocale(base);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

/** The stored choice, or null when nothing valid is stored. */
export function getStoredLocale(): Locale | null {
  try {
    return normalizeLocale(localStorage.getItem(STORAGE_KEY));
  } catch {
    // localStorage can fail in private browsing mode
    return null;
  }
}

export function setStoredLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Silently fail - the choice still applies for this session
  }
}

/**
 * An explicit choice wins; otherwise follow the browser. Someone who opens a
 * bill link from a message thread should already be reading their own language
 * rather than having to find a menu first.
 */
export function resolveLocale(): Locale {
  return getStoredLocale() ?? detectLocale();
}

export function applyLocale(locale: Locale): void {
  document.documentElement.lang = localeInfo(locale).tag;
}
