import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

/**
 * Regression tests for the authorization model.
 *
 * The premise of every test here is the attacker's actual position: they know a
 * session code (it was shared with them, or they guessed one), so they can join
 * the bill and read every query it exposes. What they must not be able to do is
 * act as somebody else.
 */

async function createBill(t: ReturnType<typeof convexTest>, hostName = "Host") {
  return await t.mutation(api.sessions.create, { hostName });
}

describe("participant identity", () => {
  it("never publishes participant secrets in the roster", async () => {
    const t = convexTest(schema);
    const { sessionId } = await createBill(t);
    await t.mutation(api.participants.join, { sessionId, name: "Guest" });

    const roster = await t.query(api.participants.listBySession, { sessionId });

    expect(roster).toHaveLength(2);
    for (const participant of roster) {
      expect(participant).not.toHaveProperty("secret");
    }
  });

  it("stops a guest from acting as the host using the host's public ID", async () => {
    const t = convexTest(schema);
    const { sessionId } = await createBill(t);
    const { secret: guestSecret } = await t.mutation(api.participants.join, {
      sessionId,
      name: "Guest",
    });

    // Exactly what an attacker has: the roster, which names the host and
    // carries their participant ID.
    const roster = await t.query(api.participants.listBySession, { sessionId });
    const host = roster.find((p) => p.isHost)!;

    await expect(
      t.mutation(api.sessions.updateTip, {
        sessionId,
        participantId: host._id,
        secret: guestSecret, // the guest's own, the only one they hold
        tipType: "manual",
        tipValue: 0,
      }),
    ).rejects.toThrow("Not authorized for this bill");
  });

  it("rejects a caller who presents no secret at all", async () => {
    const t = convexTest(schema);
    const { sessionId, hostParticipantId } = await createBill(t);

    await expect(
      t.mutation(api.sessions.updateTax, {
        sessionId,
        participantId: hostParticipantId,
        secret: "",
        tax: 100,
      }),
    ).rejects.toThrow("Not authorized for this bill");
  });

  it("rejects a secret that is close but not equal", async () => {
    const t = convexTest(schema);
    const { sessionId, hostParticipantId, hostSecret } = await createBill(t);

    const nearMiss =
      hostSecret.slice(0, -1) + (hostSecret.endsWith("a") ? "b" : "a");

    await expect(
      t.mutation(api.sessions.updateTax, {
        sessionId,
        participantId: hostParticipantId,
        secret: nearMiss,
        tax: 100,
      }),
    ).rejects.toThrow("Not authorized for this bill");
  });

  it("fails closed for participants created before secrets existed", async () => {
    const t = convexTest(schema);
    const { sessionId } = await createBill(t);

    // A row from before this migration: no secret, so no secret can match it.
    const legacyId = await t.run(async (ctx) =>
      ctx.db.insert("participants", {
        sessionId,
        name: "Legacy",
        isHost: true,
        joinedAt: Date.now(),
      }),
    );

    await expect(
      t.mutation(api.sessions.updateTax, {
        sessionId,
        participantId: legacyId,
        secret: "",
        tax: 100,
      }),
    ).rejects.toThrow("Not authorized for this bill");

    expect(
      await t.query(api.participants.me, {
        participantId: legacyId,
        secret: "",
      }),
    ).toBeNull();
  });

  it("resolves a participant from their own credentials and no one else's", async () => {
    const t = convexTest(schema);
    const { sessionId } = await createBill(t);
    const { participantId, secret } = await t.mutation(api.participants.join, {
      sessionId,
      name: "Guest",
    });

    const me = await t.query(api.participants.me, { participantId, secret });
    expect(me?.name).toBe("Guest");
    expect(me).not.toHaveProperty("secret");

    expect(
      await t.query(api.participants.me, {
        participantId,
        secret: "not-the-right-secret",
      }),
    ).toBeNull();
  });
});

describe("claims cannot be forged", () => {
  it("stops a guest from claiming on another guest's behalf", async () => {
    const t = convexTest(schema);
    const { sessionId, hostParticipantId, hostSecret } = await createBill(t);
    const itemId = await t.mutation(api.items.add, {
      sessionId,
      participantId: hostParticipantId,
      secret: hostSecret,
      name: "Oysters",
      price: 2400,
    });

    const victim = await t.mutation(api.participants.join, {
      sessionId,
      name: "Victim",
    });
    const attacker = await t.mutation(api.participants.join, {
      sessionId,
      name: "Attacker",
    });

    await expect(
      t.mutation(api.claims.claim, {
        sessionId,
        itemId,
        participantId: victim.participantId,
        secret: attacker.secret,
      }),
    ).rejects.toThrow("Not authorized for this bill");
  });

  it("stops a guest from removing another guest's claim", async () => {
    const t = convexTest(schema);
    const { sessionId, hostParticipantId, hostSecret } = await createBill(t);
    const itemId = await t.mutation(api.items.add, {
      sessionId,
      participantId: hostParticipantId,
      secret: hostSecret,
      name: "Oysters",
      price: 2400,
    });

    const victim = await t.mutation(api.participants.join, {
      sessionId,
      name: "Victim",
    });
    const attacker = await t.mutation(api.participants.join, {
      sessionId,
      name: "Attacker",
    });

    await t.mutation(api.claims.claim, {
      sessionId,
      itemId,
      participantId: victim.participantId,
      secret: victim.secret,
    });

    await expect(
      t.mutation(api.claims.unclaim, {
        itemId,
        participantId: victim.participantId,
        callerParticipantId: attacker.participantId,
        secret: attacker.secret,
      }),
    ).rejects.toThrow("Not authorized to unclaim for this participant");

    const claims = await t.query(api.claims.listBySession, { sessionId });
    expect(claims).toHaveLength(1);
  });

  it("refuses a claim against an item from a different bill", async () => {
    const t = convexTest(schema);
    const mine = await createBill(t, "Me");
    const theirs = await createBill(t, "Them");

    const theirItemId = await t.mutation(api.items.add, {
      sessionId: theirs.sessionId,
      participantId: theirs.hostParticipantId,
      secret: theirs.hostSecret,
      name: "Their Steak",
      price: 4200,
    });

    await expect(
      t.mutation(api.claims.claim, {
        sessionId: mine.sessionId,
        itemId: theirItemId,
        participantId: mine.hostParticipantId,
        secret: mine.hostSecret,
      }),
    ).rejects.toThrow("Item not found in this bill");

    expect(
      await t.query(api.claims.listBySession, { sessionId: theirs.sessionId }),
    ).toHaveLength(0);
  });

  it("does not let the host of one bill unclaim in another", async () => {
    const t = convexTest(schema);
    const victimBill = await createBill(t, "VictimHost");
    const attackerBill = await createBill(t, "AttackerHost");

    const itemId = await t.mutation(api.items.add, {
      sessionId: victimBill.sessionId,
      participantId: victimBill.hostParticipantId,
      secret: victimBill.hostSecret,
      name: "Wine",
      price: 3600,
    });
    await t.mutation(api.claims.claim, {
      sessionId: victimBill.sessionId,
      itemId,
      participantId: victimBill.hostParticipantId,
      secret: victimBill.hostSecret,
    });

    // isHost is not a global role - it only means anything inside its own bill.
    await expect(
      t.mutation(api.claims.unclaim, {
        itemId,
        participantId: victimBill.hostParticipantId,
        callerParticipantId: attackerBill.hostParticipantId,
        secret: attackerBill.hostSecret,
      }),
    ).rejects.toThrow("Not authorized to unclaim for this participant");

    await expect(
      t.mutation(api.claims.unclaimByHost, {
        itemId,
        participantId: victimBill.hostParticipantId,
        hostParticipantId: attackerBill.hostParticipantId,
        secret: attackerBill.hostSecret,
      }),
    ).rejects.toThrow("Not authorized for this bill");

    expect(
      await t.query(api.claims.listBySession, {
        sessionId: victimBill.sessionId,
      }),
    ).toHaveLength(1);
  });
});

describe("receipt storage", () => {
  it("will not hand an upload URL to a guest", async () => {
    const t = convexTest(schema);
    const { sessionId } = await createBill(t);
    const guest = await t.mutation(api.participants.join, {
      sessionId,
      name: "Guest",
    });

    await expect(
      t.mutation(api.receipts.generateUploadUrl, {
        sessionId,
        participantId: guest.participantId,
        secret: guest.secret,
      }),
    ).rejects.toThrow("Only the host can upload a receipt");
  });

  it("will not attach a file to a bill the caller does not host", async () => {
    const t = convexTest(schema);
    const victim = await createBill(t, "VictimHost");
    const attacker = await createBill(t, "AttackerHost");

    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["not a receipt"], { type: "image/png" })),
    );

    await expect(
      t.mutation(api.receipts.saveReceiptImage, {
        sessionId: victim.sessionId,
        participantId: attacker.hostParticipantId,
        secret: attacker.hostSecret,
        storageId,
      }),
    ).rejects.toThrow("Not authorized for this bill");

    const session = await t.run(async (ctx) => ctx.db.get(victim.sessionId));
    expect(session?.receiptImageId).toBeUndefined();
  });

  it("rejects an upload that is not an image", async () => {
    const t = convexTest(schema);
    const { sessionId, hostParticipantId, hostSecret } = await createBill(t);

    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(
        new Blob(["<script>alert(1)</script>"], { type: "text/html" }),
      ),
    );

    await expect(
      t.mutation(api.receipts.saveReceiptImage, {
        sessionId,
        participantId: hostParticipantId,
        secret: hostSecret,
        storageId,
      }),
    ).rejects.toThrow("Receipt must be a JPEG, PNG, GIF, or WebP image");
  });

  it("will not OCR a file that is not the bill's own receipt", async () => {
    const t = convexTest(schema);
    const { sessionId } = await createBill(t);

    // Some other file in the deployment's storage - another bill's receipt,
    // say. The vision model must not be pointed at it.
    const strangersFile = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["secrets"], { type: "image/png" })),
    );

    await expect(
      t.query(api.receipts.getReceiptUrl, {
        sessionId,
        storageId: strangersFile,
      }),
    ).rejects.toThrow("Receipt image not found for this session");
  });
});

describe("share codes", () => {
  it("draws codes from the intended alphabet without repeating", async () => {
    const t = convexTest(schema);

    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const { code } = await createBill(t, `Host${i}`);
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
      codes.add(code);
    }

    expect(codes.size).toBe(100);
  });

  it("issues a distinct high-entropy secret to every participant", async () => {
    const t = convexTest(schema);
    const { sessionId, hostSecret } = await createBill(t);

    const secrets = new Set([hostSecret]);
    for (let i = 0; i < 20; i++) {
      const { secret } = await t.mutation(api.participants.join, {
        sessionId,
        name: `Guest${i}`,
      });
      expect(secret).toMatch(/^[0-9a-f]{48}$/); // 24 bytes
      secrets.add(secret);
    }

    expect(secrets.size).toBe(21);
  });

  it("caps how many codes one lookup can probe", async () => {
    const t = convexTest(schema);

    await expect(
      t.query(api.sessions.listByCodes, {
        codes: Array.from({ length: 11 }, (_, i) => `CODE${i}`),
      }),
    ).rejects.toThrow("Too many codes");
  });
});

describe("resource limits", () => {
  it("caps the roster so one caller cannot flood a bill", async () => {
    const t = convexTest(schema);
    const { sessionId } = await createBill(t);

    // Host already occupies one slot.
    for (let i = 0; i < 49; i++) {
      await t.mutation(api.participants.join, {
        sessionId,
        name: `Guest${i}`,
      });
    }

    await expect(
      t.mutation(api.participants.join, { sessionId, name: "OneTooMany" }),
    ).rejects.toThrow("This bill is full");
  });

  it("caps a bulk item import", async () => {
    const t = convexTest(schema);
    const { sessionId, hostParticipantId, hostSecret } = await createBill(t);

    await expect(
      t.mutation(api.items.addBulk, {
        sessionId,
        participantId: hostParticipantId,
        secret: hostSecret,
        items: Array.from({ length: 501 }, (_, i) => ({
          name: `Item ${i}`,
          price: 100,
        })),
      }),
    ).rejects.toThrow("Too many items");
  });
});

describe("display names", () => {
  it("strips characters that would let a name impersonate another", async () => {
    const t = convexTest(schema);
    const { sessionId } = await createBill(t, "Alice");

    // A trailing right-to-left override renders identically to "Alice".
    const { participantId } = await t.mutation(api.participants.join, {
      sessionId,
      name: "Bob‮​",
    });

    const participant = (await t.run(async (ctx) =>
      ctx.db.get(participantId as Id<"participants">),
    ))!;
    expect(participant.name).toBe("Bob");
  });

  it("treats a lookalike spelling as the name already taken", async () => {
    const t = convexTest(schema);
    const { sessionId } = await createBill(t, "Alice");

    // Fullwidth "Ａ" normalizes onto the same key as the host's plain "A".
    await expect(
      t.mutation(api.participants.join, { sessionId, name: "Ａlice" }),
    ).rejects.toThrow("That name is already taken");
  });
});
