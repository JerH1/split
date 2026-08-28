import {
  Fragment,
  ReactNode,
  createElement,
  useCallback,
  useMemo,
  useState,
} from "react";
import { LocaleContext, LocaleContextValue } from "./context";
import { MessageKey, Messages, en } from "./en";
import { es } from "./es";
import { de } from "./de";
import { th } from "./th";
import {
  Locale,
  applyLocale,
  localeInfo,
  resolveLocale,
  setStoredLocale,
} from "./locales";
import { Vars, selectMessage, splitTemplate, translate } from "./translate";

const CATALOGS: Record<Locale, Messages> = { en, es, de, th };

/**
 * Holds the chosen language and hands the rest of the app a `t`.
 *
 * The whole catalog for every language is about 12KB of strings, so all four
 * are imported directly rather than code-split. A lazy chunk would mean the
 * first paint of a bill someone opened from a message thread showing either
 * English or nothing while it loaded, which is exactly the moment the language
 * matters most.
 */
export default function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => resolveLocale());

  const setLocale = useCallback((next: Locale) => {
    setStoredLocale(next);
    setLocaleState(next);
    applyLocale(next);
  }, []);

  const value = useMemo<LocaleContextValue>(() => {
    const messages = CATALOGS[locale];

    const t = (key: MessageKey, vars?: Vars) =>
      translate(messages, en, locale, key, vars);

    const tNodes = (key: MessageKey, vars: Record<string, ReactNode>) => {
      const count = typeof vars.count === "number" ? vars.count : undefined;
      const template = selectMessage(messages, en, locale, key, count);
      return splitTemplate(template).map((part, index) =>
        part.name !== undefined && part.name in vars
          ? createElement(Fragment, { key: index }, vars[part.name])
          : part.text,
      );
    };

    const dateFormat = new Intl.DateTimeFormat(localeInfo(locale).tag, {
      dateStyle: "medium",
    });

    return {
      locale,
      setLocale,
      t,
      tNodes,
      formatDate: (timestamp: number) => dateFormat.format(new Date(timestamp)),
    };
  }, [locale, setLocale]);

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}
