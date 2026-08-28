import { createContext, useContext, ReactNode } from "react";
import { MessageKey } from "./en";
import { Locale } from "./locales";
import { Vars } from "./translate";

export interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Translate a key to a string. */
  t: (key: MessageKey, vars?: Vars) => string;
  /**
   * Translate a key where one placeholder is a React node rather than text —
   * a bolded name, an emphasised amount.
   *
   * The alternative, splicing markup around a translated fragment, assumes the
   * placeholder sits in the same position in every language. It does not: "{name}
   * joined" and "จ่าย {name} {amount}" put it in different places, and German
   * moves it again.
   */
  tNodes: (key: MessageKey, vars: Record<string, ReactNode>) => ReactNode[];
  /** A date in the reader's locale. Dates, unlike money, do vary by language. */
  formatDate: (timestamp: number) => string;
}

export const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error("useLocale must be used inside a <LocaleProvider>");
  }
  return value;
}

/** The common case: just the translate function. */
export function useT(): LocaleContextValue["t"] {
  return useLocale().t;
}
