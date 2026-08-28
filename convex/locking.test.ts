import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { LOCKED_MESSAGE } from "./locking";

/**
 * Build a session with a host, a guest, and one claimable item.
 * `locked` seeds the bill as already frozen.
 */
async function setup(t: ReturnType<typeof convexTest>, locked = false) {
  return await t.run(async (ctx) => {
    const sessionId = await ctx.db.insert("sessions", {
      code: "ABC123",
      hostName: "Host",
      createdAt: Date.now(),
      ...(locked ? { lockedAt: Date.now() } : {}),
    });
    const hostId = await ctx.db.insert("participants", {
      sessionId,
      name: "Host",
      isHost: true,
      joinedAt: Date.now(),
    });
    const guestId = await ctx.db.insert("participants", {
      sessionId,
      name: "Guest",
      isHost: false,
      joinedAt: Date.now() + 1,
    });
    const itemId = await ctx.db.insert("items", {
      sessionId,
      name: "Burger",
      price: 1500,
      quantity: 1,
    });
    return { sessionId, hostId, guestId, itemId };
  });
}

describe("bill locking", () => {
  describe("setLocked", () => {
    it("lets the host freeze the bill", async () => {
      const t = convexTest(schema);
      const { sessionId, hostId } = await setup(t);

      await t.mutation(api.sessions.setLocked, {
        sessionId,
        participantId: hostId,
        locked: true,
      });

      const session = await t.run(async (ctx) => ctx.db.get(sessionId));
      expect(session?.lockedAt).toEqual(expect.any(Number));
    });

    it("rejects a guest trying to lock the bill", async () => {
      const t = convexTest(schema);
      const { sessionId, guestId } = await setup(t);

      await expect(
        t.mutation(api.sessions.setLocked, {
          sessionId,
          participantId: guestId,
          locked: true,
        }),
      ).rejects.toThrow("Only the host can lock this bill");
    });

    it("unlocks a locked bill, which is the one write locking must not block", async () => {
      const t = convexTest(schema);
      const { sessionId, hostId } = await setup(t, true);

      await t.mutation(api.sessions.setLocked, {
        sessionId,
        participantId: hostId,
        locked: false,
      });

      const session = await t.run(async (ctx) => ctx.db.get(sessionId));
      expect(session?.lockedAt).toBeUndefined();
    });
  });

  describe("guards on a locked bill", () => {
    it("refuses new items", async () => {
      const t = convexTest(schema);
      const { sessionId, hostId } = await setup(t, true);

      await expect(
        t.mutation(api.items.add, {
          sessionId,
          participantId: hostId,
          name: "Late fries",
          price: 500,
        }),
      ).rejects.toThrow(LOCKED_MESSAGE);
    });

    it("refuses edits to an existing item", async () => {
      const t = convexTest(schema);
      const { hostId, itemId } = await setup(t, true);

      await expect(
        t.mutation(api.items.update, {
          itemId,
          participantId: hostId,
          price: 9900,
        }),
      ).rejects.toThrow(LOCKED_MESSAGE);
    });

    it("refuses item deletion", async () => {
      const t = convexTest(schema);
      const { hostId, itemId } = await setup(t, true);

      await expect(
        t.mutation(api.items.remove, { itemId, participantId: hostId }),
      ).rejects.toThrow(LOCKED_MESSAGE);
    });

    it("refuses new claims", async () => {
      const t = convexTest(schema);
      const { sessionId, guestId, itemId } = await setup(t, true);

      await expect(
        t.mutation(api.claims.claim, {
          sessionId,
          itemId,
          participantId: guestId,
        }),
      ).rejects.toThrow(LOCKED_MESSAGE);
    });

    it("refuses unclaiming, so a locked split cannot be quietly reduced", async () => {
      const t = convexTest(schema);
      const { sessionId, guestId, itemId } = await setup(t);

      await t.mutation(api.claims.claim, {
        sessionId,
        itemId,
        participantId: guestId,
      });
      await t.run(async (ctx) => {
        await ctx.db.patch(sessionId, { lockedAt: Date.now() });
      });

      await expect(
        t.mutation(api.claims.unclaim, {
          itemId,
          participantId: guestId,
          callerParticipantId: guestId,
        }),
      ).rejects.toThrow(LOCKED_MESSAGE);
    });

    it("refuses tip changes", async () => {
      const t = convexTest(schema);
      const { sessionId, hostId } = await setup(t, true);

      await expect(
        t.mutation(api.sessions.updateTip, {
          sessionId,
          participantId: hostId,
          tipType: "percent_subtotal",
          tipValue: 25,
        }),
      ).rejects.toThrow(LOCKED_MESSAGE);
    });

    it("refuses fee changes", async () => {
      const t = convexTest(schema);
      const { sessionId, hostId } = await setup(t, true);

      await expect(
        t.mutation(api.fees.add, {
          sessionId,
          participantId: hostId,
          label: "Surprise Fee",
          amount: 300,
        }),
      ).rejects.toThrow(LOCKED_MESSAGE);
    });

    it("still allows marking a share paid, since locking is when people pay", async () => {
      const t = convexTest(schema);
      const { guestId } = await setup(t, true);

      await t.mutation(api.participants.setPaid, {
        participantId: guestId,
        callerParticipantId: guestId,
        paid: true,
      });

      const guest = await t.run(async (ctx) => ctx.db.get(guestId));
      expect(guest?.paidAt).toEqual(expect.any(Number));
    });
  });
});
