import { describe, it, expect } from "vitest";
import { en, Messages, MessageKey } from "../src/lib/i18n/en";
import { es } from "../src/lib/i18n/es";
import { de } from "../src/lib/i18n/de";
import { th } from "../src/lib/i18n/th";
import {
  interpolate,
  selectMessage,
  splitTemplate,
  translate,
} from "../src/lib/i18n/translate";
import {
  DEFAULT_LOCALE,
  LOCALES,
  Locale,
  detectLocale,
  localeInfo,
  normalizeLocale,
} from "../src/lib/i18n/locales";

const CATALOGS: Record<Locale, Messages> = { en, es, de, th };
const TRANSLATED: [Locale, Messages][] = [
  ["es", es],
  ["de", de],
  ["th", th],
];

const keys = Object.keys(en) as MessageKey[];

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

/** Every string a catalog holds, flattened across plural forms. */
function strings(messages: Messages, key: MessageKey): string[] {
  const value = messages[key];
  return typeof value === "string" ? [value] : [value.one, value.other];
}

describe("catalogs", () => {
  it("covers every language the picker offers", () => {
    for (const { id } of LOCALES) {
      expect(CATALOGS[id], `no catalog for ${id}`).toBeDefined();
    }
  });

  // tsc already enforces this at build time. Repeated here because the failure
  // it prevents - a blank button on someone's phone - is worth two guards.
  it.each(TRANSLATED)("%s has exactly the English key set", (_id, messages) => {
    expect(Object.keys(messages).sort()).toEqual(keys.slice().sort());
  });

  it.each(TRANSLATED)("%s leaves nothing blank", (_id, messages) => {
    for (const key of keys) {
      for (const value of strings(messages, key)) {
        expect(value.trim(), `${key} is empty`).not.toBe("");
      }
    }
  });

  it.each(TRANSLATED)("%s keeps the plural shape", (_id, messages) => {
    for (const key of keys) {
      expect(
        typeof messages[key],
        `${key} changed between a plain string and a plural`,
      ).toBe(typeof en[key]);
    }
  });

  // The one class of mistake nothing else catches: a mistyped placeholder is a
  // perfectly valid string, so tsc is happy and the phone renders "{naem}".
  it.each(TRANSLATED)(
    "%s uses only the English placeholders",
    (_id, messages) => {
      for (const key of keys) {
        const expected = placeholders(strings(en, key).join(" "));
        for (const value of strings(messages, key)) {
          for (const name of placeholders(value)) {
            expect(
              expected,
              `${key} has an unknown placeholder {${name}}`,
            ).toContain(name);
          }
        }
      }
    },
  );

  it("keeps every amount placeholder out of a plural selector", () => {
    // A plural chosen by `count` needs a `count` to choose on.
    for (const key of keys) {
      if (typeof en[key] === "string") continue;
      expect(placeholders(en[key].other), `${key}`).toContain("count");
    }
  });
});

describe("plurals", () => {
  it("uses the singular only where the language has one", () => {
    expect(translate(en, en, "en", "tabs.unclaimedAria", { count: 1 })).toBe(
      ", 1 unclaimed item",
    );
    expect(translate(en, en, "en", "tabs.unclaimedAria", { count: 2 })).toBe(
      ", 2 unclaimed items",
    );
    // English 0 is plural, and CLDR knows that without being told.
    expect(translate(en, en, "en", "tabs.unclaimedAria", { count: 0 })).toBe(
      ", 0 unclaimed items",
    );
  });

  it("gives German its own one/other split", () => {
    expect(
      translate(de, en, "de", "totals.unclaimedWarning", { count: 1 }),
    ).toContain("1 Position noch offen");
    expect(
      translate(de, en, "de", "totals.unclaimedWarning", { count: 3 }),
    ).toContain("3 Positionen noch offen");
  });

  // The reason this module uses Intl.PluralRules instead of `count === 1`.
  it("never inflects Thai, which has one grammatical number", () => {
    const one = translate(th, en, "th", "tabs.unclaimedAria", { count: 1 });
    const many = translate(th, en, "th", "tabs.unclaimedAria", { count: 7 });
    expect(one).toBe(", 1 รายการที่ยังไม่มีคนเลือก");
    expect(many).toBe(", 7 รายการที่ยังไม่มีคนเลือก");
  });

  it("treats a missing count as zero rather than throwing", () => {
    expect(() => translate(en, en, "en", "tabs.unclaimedAria")).not.toThrow();
  });
});

describe("interpolate", () => {
  it("fills placeholders from vars", () => {
    expect(
      interpolate("Pay {name} {amount}", { name: "Sam", amount: "$4" }),
    ).toBe("Pay Sam $4");
  });

  it("fills a placeholder used more than once", () => {
    expect(interpolate("{a} and {a}", { a: "x" })).toBe("x and x");
  });

  it("leaves an unsupplied placeholder visible rather than printing undefined", () => {
    expect(interpolate("Hi {name}", {})).toBe("Hi {name}");
  });

  it("accepts numbers", () => {
    expect(interpolate("{count} left", { count: 3 })).toBe("3 left");
  });
});

describe("selectMessage and splitTemplate", () => {
  it("returns the template with placeholders intact", () => {
    expect(selectMessage(en, en, "en", "join.toast")).toBe("{name} joined");
  });

  it("splits a template into literals and markers, in source order", () => {
    expect(splitTemplate("Pay {name} {amount}")).toEqual([
      { text: "Pay " },
      { text: "{name}", name: "name" },
      { text: " " },
      { text: "{amount}", name: "amount" },
    ]);
  });

  it("handles a template that opens with a placeholder", () => {
    // Thai and German both put the name first here; English does too, but the
    // splitter must not assume a leading literal exists.
    expect(splitTemplate("{name} joined")).toEqual([
      { text: "{name}", name: "name" },
      { text: " joined" },
    ]);
  });

  it("falls back to English for a key a catalog somehow lacks", () => {
    const gappy = { ...es } as Messages;
    delete (gappy as Record<string, unknown>)["common.save"];
    expect(translate(gappy, en, "es", "common.save")).toBe("Save");
  });
});

describe("locale resolution", () => {
  it("matches on the primary subtag, so es-MX and es-419 both get Spanish", () => {
    expect(detectLocale(["es-MX"])).toBe("es");
    expect(detectLocale(["es-419"])).toBe("es");
    expect(detectLocale(["de-AT"])).toBe("de");
    expect(detectLocale(["th-TH"])).toBe("th");
  });

  it("takes the first supported language, not the first listed", () => {
    expect(detectLocale(["fr-FR", "pt-BR", "de-DE", "en-US"])).toBe("de");
  });

  it("falls back to English when nothing is supported", () => {
    expect(detectLocale(["fr", "ja"])).toBe(DEFAULT_LOCALE);
    expect(detectLocale([])).toBe(DEFAULT_LOCALE);
  });

  it("ignores junk in storage", () => {
    expect(normalizeLocale("klingon")).toBeNull();
    expect(normalizeLocale(null)).toBeNull();
    expect(normalizeLocale(7)).toBeNull();
    expect(normalizeLocale("de")).toBe("de");
  });

  it("gives every locale a tag Intl accepts", () => {
    for (const { id, endonym, tag } of LOCALES) {
      expect(endonym.trim()).not.toBe("");
      expect(() => new Intl.PluralRules(tag)).not.toThrow();
      expect(() => new Intl.DateTimeFormat(tag)).not.toThrow();
      expect(localeInfo(id).tag).toBe(tag);
    }
  });
});
