import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildSummaryText,
  shareSummary,
  Translate,
} from "../src/lib/shareSummary";
import { en } from "../src/lib/i18n/en";
import { de } from "../src/lib/i18n/de";
import { Messages } from "../src/lib/i18n/en";
import { translate } from "../src/lib/i18n/translate";
import { Locale } from "../src/lib/i18n/locales";

/** A real translate function, so these assertions test the shipped strings. */
function translator(messages: Messages, locale: Locale): Translate {
  return (key, vars) => translate(messages, en, locale, key, vars);
}

const t = translator(en, "en");

const base = {
  people: [
    { name: "Jeremie", total: 2431 },
    { name: "Sam", total: 1820 },
  ],
  code: "ABC123",
  billUrl: "https://split.app/bill/ABC123",
  unclaimedTotal: 0,
};

describe("buildSummaryText", () => {
  it("lists each person with their share and the group total", () => {
    const text = buildSummaryText({ ...base, merchant: "Joe's Diner" }, t);

    expect(text).toContain("Split for Joe's Diner");
    expect(text).toContain("Jeremie: $24.31");
    expect(text).toContain("Sam: $18.20");
    expect(text).toContain("Total: $42.51");
  });

  it("falls back to a generic heading when no merchant was parsed", () => {
    expect(buildSummaryText(base, t)).toContain("Bill split");
  });

  it("includes the link and the code, since either may be the useful one", () => {
    const text = buildSummaryText(base, t);
    expect(text).toContain("https://split.app/bill/ABC123");
    expect(text).toContain("Code: ABC123");
  });

  it("says so when items are still unclaimed, rather than reading as final", () => {
    const text = buildSummaryText({ ...base, unclaimedTotal: 1200 }, t);
    expect(text).toContain("Unclaimed: $12.00 still to be split");
  });

  it("omits the unclaimed line when everything is accounted for", () => {
    expect(buildSummaryText(base, t)).not.toContain("Unclaimed");
  });

  it("stays plain text so it survives being pasted into any chat app", () => {
    const text = buildSummaryText({ ...base, merchant: "Joe's Diner" }, t);
    expect(text).not.toMatch(/[*_`|]/);
  });

  it("is written in the language of whoever tapped Share", () => {
    const text = buildSummaryText(
      { ...base, merchant: "Joe's Diner", unclaimedTotal: 1200 },
      translator(de, "de"),
    );

    expect(text).toContain("Aufteilung für Joe's Diner");
    expect(text).toContain("Gesamt: $42.51");
    expect(text).toContain("Offen: $12.00 noch aufzuteilen");
    expect(text).toContain("Code: ABC123");
  });

  it("carries each person's handle, so the chat can settle up from the paste", () => {
    const text = buildSummaryText(
      {
        ...base,
        people: [
          {
            name: "Jeremie",
            total: 2431,
            paymentMethod: "venmo" as const,
            paymentHandle: "jeremie-h",
          },
          { name: "Sam", total: 1820 },
        ],
      },
      t,
    );

    expect(text).toContain("Pay them back:");
    expect(text).toContain("Jeremie — Venmo: https://venmo.com/u/jeremie-h");
    // Sam never said how to pay them, so Sam gets no line rather than a broken one.
    expect(text).not.toContain("Sam — ");
  });

  it("links to a profile, not a prefilled amount", () => {
    // Everyone reading the paste owes something different, so an amount baked
    // into the link would be wrong for all but one of them.
    const text = buildSummaryText(
      {
        ...base,
        people: [
          {
            name: "Jeremie",
            total: 2431,
            paymentMethod: "venmo" as const,
            paymentHandle: "jeremie-h",
          },
        ],
      },
      t,
    );

    expect(text).not.toContain("24.31&");
    expect(text).not.toContain("txn=pay");
  });

  it("falls back to the bare handle for a method with no profile page", () => {
    const text = buildSummaryText(
      {
        ...base,
        people: [
          {
            name: "Sam",
            total: 1820,
            paymentMethod: "other" as const,
            paymentHandle: "sam.pay",
          },
        ],
      },
      t,
    );

    expect(text).toContain("Sam — Other: sam.pay");
    expect(text).not.toContain("venmo.com");
    expect(text).not.toContain("cash.app");
  });

  it("omits the pay-back block entirely when nobody has a handle", () => {
    expect(buildSummaryText(base, t)).not.toContain("Pay them back");
  });

  it("keeps amounts in dollars whatever the language", () => {
    // The receipt on the table is printed "$24.31". Rendering it as "24,31 $"
    // for a German reader would put the app and the paper in visible
    // disagreement about a number that did not change.
    const text = buildSummaryText(base, translator(de, "de"));
    expect(text).toContain("Jeremie: $24.31");
    expect(text).not.toContain("24,31");
  });
});

describe("shareSummary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the native share sheet when the platform has one", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText } });

    expect(await shareSummary("body", "title")).toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: "title", text: "body" });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to the clipboard where there is no share sheet", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    expect(await shareSummary("body", "title")).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("body");
  });

  it("does not quietly copy when someone dismisses the share sheet", async () => {
    const abort = new Error("dismissed");
    abort.name = "AbortError";
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      share: vi.fn().mockRejectedValue(abort),
      clipboard: { writeText },
    });

    expect(await shareSummary("body", "title")).toBe("failed");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to the clipboard when sharing fails for a real reason", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      share: vi.fn().mockRejectedValue(new Error("not allowed")),
      clipboard: { writeText },
    });

    expect(await shareSummary("body", "title")).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("body");
  });

  it("reports failure when neither route works", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });

    expect(await shareSummary("body", "title")).toBe("failed");
  });
});
