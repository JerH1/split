import { Messages, MessageKey } from "./en";
import { Locale, localeInfo } from "./locales";

export type Vars = Record<string, string | number>;

/**
 * A message with more than one form. Which one is used is decided by
 * Intl.PluralRules for the reader's locale, not by `count === 1`:
 *
 * - Thai has a single form, so it always lands on `other` and a hand-rolled
 *   `count === 1 ? a : b` would produce a sentence no Thai reader would write.
 * - English, Spanish and German each split one/other, but not on the same
 *   values, and CLDR knows where.
 *
 * These four locales only ever select "one" or "other", so those are the only
 * forms a catalog has to carry. Adding a language with "few"/"many" (Polish,
 * Arabic) means widening this type, and tsc will say so at every catalog.
 */
export interface Plural {
  one: string;
  other: string;
}

const pluralRules = new Map<Locale, Intl.PluralRules>();

function rulesFor(locale: Locale): Intl.PluralRules {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(localeInfo(locale).tag);
    pluralRules.set(locale, rules);
  }
  return rules;
}

function isPlural(value: string | Plural): value is Plural {
  return typeof value !== "string";
}

/** Fill `{placeholders}` from `vars`, leaving an unmatched one visible. */
export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/**
 * The raw template for a key, with the plural form chosen but placeholders
 * still in place.
 *
 * Separate from translate() because tNodes() needs to split a template around
 * its placeholders before anything is substituted into it.
 *
 * A missing key falls back to English rather than rendering the key itself:
 * an untranslated label is a smaller failure than a blank button, and tsc
 * already prevents the case at build time. This is the runtime belt.
 */
export function selectMessage(
  messages: Messages,
  fallback: Messages,
  locale: Locale,
  key: MessageKey,
  count?: number,
): string {
  const message = messages[key] ?? fallback[key];
  if (message === undefined) return key;
  if (!isPlural(message)) return message;

  const category = rulesFor(locale).select(count ?? 0);
  return category === "one" ? message.one : message.other;
}

/** Resolve one key against one catalog, placeholders filled. */
export function translate(
  messages: Messages,
  fallback: Messages,
  locale: Locale,
  key: MessageKey,
  vars?: Vars,
): string {
  const template = selectMessage(
    messages,
    fallback,
    locale,
    key,
    vars?.count === undefined ? undefined : Number(vars.count),
  );
  return interpolate(template, vars);
}

/**
 * Split a template into its literal runs and its `{placeholder}` markers, in
 * source order. Callers substitute the markers for whatever they like — a
 * string, or a React node.
 */
export function splitTemplate(
  template: string,
): { text: string; name?: string }[] {
  return template
    .split(/(\{\w+\})/g)
    .filter((part) => part !== "")
    .map((part) => {
      const match = /^\{(\w+)\}$/.exec(part);
      return match ? { text: part, name: match[1] } : { text: part };
    });
}
