import { describe, it, expect } from "vitest";
import {
  buildPaymentUrl,
  buildProfileUrl,
  formatHandle,
  isValidPaymentHandle,
  normalizePaymentHandle,
  PAYMENT_METHOD_LABELS,
} from "../src/lib/paymentLinks";

describe("buildPaymentUrl", () => {
  it("prefills a Venmo payment with recipient, amount and note", () => {
    const url = buildPaymentUrl("venmo", "jeremie-h", 2431, "Joe's Diner")!;
    const params = new URL(url).searchParams;

    expect(new URL(url).origin).toBe("https://venmo.com");
    expect(params.get("txn")).toBe("pay");
    expect(params.get("recipients")).toBe("jeremie-h");
    expect(params.get("amount")).toBe("24.31");
    expect(params.get("note")).toBe("Joe's Diner");
  });

  it("keeps Venmo payments private rather than posting them to a public feed", () => {
    const url = buildPaymentUrl("venmo", "someone", 100, "Dinner")!;
    expect(new URL(url).searchParams.get("audience")).toBe("private");
  });

  it("builds a Cash App link with the $ prefix in the path", () => {
    expect(buildPaymentUrl("cashapp", "jeremie", 1850, "Dinner")).toBe(
      "https://cash.app/$jeremie/18.50",
    );
  });

  it("builds a PayPal.me link", () => {
    expect(buildPaymentUrl("paypal", "jeremie", 500, "Dinner")).toBe(
      "https://paypal.me/jeremie/5.00",
    );
  });

  it("has no link for a handle on some other service", () => {
    expect(buildPaymentUrl("other", "jeremie", 500, "Dinner")).toBeNull();
  });

  it("renders whole-dollar amounts with cents, as payment apps expect", () => {
    expect(buildPaymentUrl("cashapp", "a", 2000, "x")).toContain("/20.00");
  });

  it("encodes a handle so it cannot escape its path segment", () => {
    // Validation rejects these server-side; this is the second line of defence,
    // because a link that redirects a repayment is worth failing twice on.
    const url = buildPaymentUrl("cashapp", "victim/../attacker", 100, "x")!;
    expect(url).toBe("https://cash.app/$victim%2F..%2Fattacker/1.00");
    expect(new URL(url).pathname).toBe("/$victim%2F..%2Fattacker/1.00");
  });

  it("encodes a note so it cannot inject extra query parameters", () => {
    const url = buildPaymentUrl(
      "venmo",
      "someone",
      100,
      "Dinner&amount=99999",
    )!;
    expect(new URL(url).searchParams.get("amount")).toBe("1.00");
    expect(new URL(url).searchParams.get("note")).toBe("Dinner&amount=99999");
  });
});

describe("formatHandle", () => {
  it("writes each handle the way its service does", () => {
    expect(formatHandle("venmo", "jeremie")).toBe("@jeremie");
    expect(formatHandle("cashapp", "jeremie")).toBe("$jeremie");
    expect(formatHandle("paypal", "jeremie")).toBe("jeremie");
    expect(formatHandle("other", "jeremie")).toBe("jeremie");
  });
});

describe("PAYMENT_METHOD_LABELS", () => {
  it("names every method the UI can offer", () => {
    expect(Object.keys(PAYMENT_METHOD_LABELS).sort()).toEqual([
      "cashapp",
      "other",
      "paypal",
      "venmo",
    ]);
  });
});

describe("buildProfileUrl", () => {
  it("points at the payee's page, with no amount attached", () => {
    expect(buildProfileUrl("venmo", "jeremie-h")).toBe(
      "https://venmo.com/u/jeremie-h",
    );
    expect(buildProfileUrl("cashapp", "jeremie")).toBe(
      "https://cash.app/$jeremie",
    );
    expect(buildProfileUrl("paypal", "jeremie")).toBe(
      "https://paypal.me/jeremie",
    );
  });

  it("has no link to offer for a handle typed into some other app", () => {
    expect(buildProfileUrl("other", "jeremie")).toBeNull();
  });

  it("encodes the handle, so a crafted one cannot reshape the URL", () => {
    expect(buildProfileUrl("venmo", "victim/../attacker")).toBe(
      "https://venmo.com/u/victim%2F..%2Fattacker",
    );
  });
});

describe("normalizePaymentHandle", () => {
  it("drops the sigil people write in front of their own handle", () => {
    expect(normalizePaymentHandle("  @jeremie-h ")).toBe("jeremie-h");
  });
});

describe("isValidPaymentHandle", () => {
  it("accepts what the server accepts", () => {
    expect(isValidPaymentHandle("@jeremie-h")).toBe(true);
    expect(isValidPaymentHandle("j.hassan_1+pay")).toBe(true);
  });

  it("rejects what the server would reject, before it is saved", () => {
    expect(isValidPaymentHandle("")).toBe(false);
    expect(isValidPaymentHandle("   ")).toBe(false);
    expect(isValidPaymentHandle("victim/../attacker")).toBe(false);
    expect(isValidPaymentHandle("has space")).toBe(false);
    expect(isValidPaymentHandle("a".repeat(65))).toBe(false);
  });
});
