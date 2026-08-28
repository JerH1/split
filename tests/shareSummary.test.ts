import { describe, it, expect, vi, afterEach } from "vitest";
import { buildSummaryText, shareSummary } from "../src/lib/shareSummary";

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
    const text = buildSummaryText({ ...base, merchant: "Joe's Diner" });

    expect(text).toContain("Split for Joe's Diner");
    expect(text).toContain("Jeremie: $24.31");
    expect(text).toContain("Sam: $18.20");
    expect(text).toContain("Total: $42.51");
  });

  it("falls back to a generic heading when no merchant was parsed", () => {
    expect(buildSummaryText(base)).toContain("Bill split");
  });

  it("includes the link and the code, since either may be the useful one", () => {
    const text = buildSummaryText(base);
    expect(text).toContain("https://split.app/bill/ABC123");
    expect(text).toContain("Code: ABC123");
  });

  it("says so when items are still unclaimed, rather than reading as final", () => {
    const text = buildSummaryText({ ...base, unclaimedTotal: 1200 });
    expect(text).toContain("Unclaimed: $12.00 still to be split");
  });

  it("omits the unclaimed line when everything is accounted for", () => {
    expect(buildSummaryText(base)).not.toContain("Unclaimed");
  });

  it("stays plain text so it survives being pasted into any chat app", () => {
    const text = buildSummaryText({ ...base, merchant: "Joe's Diner" });
    expect(text).not.toMatch(/[*_`|]/);
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
