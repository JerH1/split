import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

async function setup(t: ReturnType<typeof convexTest>, quantity = 1) {
  return await t.run(async (ctx) => {
    const sessionId = await ctx.db.insert("sessions", {
      code: "ABC123",
      hostName: "Host",
      createdAt: Date.now(),
    });
    const hostId = await ctx.db.insert("participants", {
      sessionId,
      name: "Host",
      isHost: true,
      joinedAt: 1,
      secret: "host-secret",
    });
    const guestId = await ctx.db.insert("participants", {
      sessionId,
      name: "Guest",
      isHost: false,
      joinedAt: 2,
      secret: "guest-secret",
    });
    const thirdId = await ctx.db.insert("participants", {
      sessionId,
      name: "Third",
      isHost: false,
      joinedAt: 3,
      secret: "third-secret",
    });
    const itemId = await ctx.db.insert("items", {
      sessionId,
      name: "Bottle of wine",
      price: 4500,
      quantity,
    });
    return { sessionId, hostId, guestId, thirdId, itemId };
  });
}

/**
 * Claims on one item, via the public query the app itself uses.
 *
 * Going through the API rather than ctx.db keeps this readable under the
 * schema-less typing the Convex CLI applies to files in convex/.
 */
async function claimsOn(
  t: ReturnType<typeof convexTest>,
  sessionId: Id<"sessions">,
  itemId: Id<"items">,
) {
  const claims = await t.query(api.claims.listBySession, { sessionId });
  return claims.filter((claim) => claim.itemId === itemId);
}

describe("shared items", () => {
  describe("claimForEveryone", () => {
    it("claims one item for every participant in the bill", async () => {
      const t = convexTest(schema);
      const { sessionId, hostId, itemId } = await setup(t);

      await t.mutation(api.claims.claimForEveryone, {
        sessionId,
        itemId,
        participantId: hostId,
        secret: "host-secret",
      });

      expect(await claimsOn(t, sessionId, itemId)).toHaveLength(3);
    });

    it("does not double-claim for someone who already claimed it", async () => {
      const t = convexTest(schema);
      const { sessionId, hostId, guestId, itemId } = await setup(t);

      await t.mutation(api.claims.claim, {
        sessionId,
        itemId,
        participantId: guestId,
        secret: "guest-secret",
      });
      await t.mutation(api.claims.claimForEveryone, {
        sessionId,
        itemId,
        participantId: hostId,
        secret: "host-secret",
      });

      const claims = await claimsOn(t, sessionId, itemId);
      expect(claims).toHaveLength(3);
      expect(new Set(claims.map((c) => c.participantId)).size).toBe(3);
    });

    it("splits the price evenly once everyone is on it", async () => {
      const t = convexTest(schema);
      const { sessionId, hostId, itemId } = await setup(t);

      await t.mutation(api.claims.claimForEveryone, {
        sessionId,
        itemId,
        participantId: hostId,
        secret: "host-secret",
      });

      const totals = await t.query(api.participants.getTotals, { sessionId });
      expect(totals.participants.map((p) => p.subtotal)).toEqual([
        1500, 1500, 1500,
      ]);
      expect(totals.unclaimedTotal).toBe(0);
    });

    it("refuses a caller presenting the wrong secret", async () => {
      const t = convexTest(schema);
      const { sessionId, hostId, itemId } = await setup(t);

      await expect(
        t.mutation(api.claims.claimForEveryone, {
          sessionId,
          itemId,
          participantId: hostId,
          secret: "not-the-host-secret",
        }),
      ).rejects.toThrow("Not authorized for this bill");
    });

    it("refuses an item belonging to a different bill", async () => {
      const t = convexTest(schema);
      const { sessionId, hostId } = await setup(t);
      const foreignItemId = await t.run(async (ctx) => {
        const otherSessionId = await ctx.db.insert("sessions", {
          code: "XYZ789",
          hostName: "Elsewhere",
          createdAt: Date.now(),
        });
        return await ctx.db.insert("items", {
          sessionId: otherSessionId,
          name: "Not yours",
          price: 100,
          quantity: 1,
        });
      });

      await expect(
        t.mutation(api.claims.claimForEveryone, {
          sessionId,
          itemId: foreignItemId,
          participantId: hostId,
          secret: "host-secret",
        }),
      ).rejects.toThrow("Item not found in this session");
    });
  });

  describe("unclaimEveryone", () => {
    it("drops every claim on the item in one go", async () => {
      const t = convexTest(schema);
      const { sessionId, hostId, itemId } = await setup(t);

      await t.mutation(api.claims.claimForEveryone, {
        sessionId,
        itemId,
        participantId: hostId,
        secret: "host-secret",
      });
      await t.mutation(api.claims.unclaimEveryone, {
        itemId,
        participantId: hostId,
        secret: "host-secret",
      });

      expect(await claimsOn(t, sessionId, itemId)).toHaveLength(0);
    });

    it("refuses a caller who is not in the bill", async () => {
      const t = convexTest(schema);
      const { itemId } = await setup(t);
      const outsiderId = await t.run(async (ctx) => {
        const otherSessionId = await ctx.db.insert("sessions", {
          code: "XYZ789",
          hostName: "Elsewhere",
          createdAt: Date.now(),
        });
        return await ctx.db.insert("participants", {
          sessionId: otherSessionId,
          name: "Outsider",
          isHost: true,
          joinedAt: Date.now(),
          secret: "outsider-secret",
        });
      });

      await expect(
        t.mutation(api.claims.unclaimEveryone, {
          itemId,
          participantId: outsiderId,
          secret: "outsider-secret",
        }),
      ).rejects.toThrow("Not authorized for this bill");
    });
  });

  describe("quantity", () => {
    it("charges a claimant for every unit of a multi-quantity line", async () => {
      const t = convexTest(schema);
      // One line of 3 beers at $6.50 each: the claimant owes $19.50, not $6.50.
      const { sessionId, hostId, itemId } = await setup(t, 3);
      await t.run(async (ctx) => {
        await ctx.db.patch(itemId, { name: "Pilsner", price: 650 });
      });

      await t.mutation(api.claims.claim, {
        sessionId,
        itemId,
        participantId: hostId,
        secret: "host-secret",
      });

      const totals = await t.query(api.participants.getTotals, { sessionId });
      const host = totals.participants.find((p) => p.name === "Host");
      expect(host?.subtotal).toBe(1950);
      expect(totals.groupSubtotal).toBe(1950);
    });

    it("counts every unit of an unclaimed line as still owed", async () => {
      const t = convexTest(schema);
      const { sessionId, itemId } = await setup(t, 3);
      await t.run(async (ctx) => {
        await ctx.db.patch(itemId, { name: "Pilsner", price: 650 });
      });

      const totals = await t.query(api.participants.getTotals, { sessionId });
      expect(totals.unclaimedTotal).toBe(1950);
    });

    it("splits fees against the full quantity-aware subtotal", async () => {
      const t = convexTest(schema);
      const { sessionId, hostId, guestId, itemId } = await setup(t, 2);
      // Host takes a $10.00 x2 line ($20.00); guest takes a $20.00 line.
      // An even 50/50 split of the bill means an even split of a $4.00 fee.
      await t.run(async (ctx) => {
        await ctx.db.patch(itemId, { price: 1000 });
        const guestItemId = await ctx.db.insert("items", {
          sessionId,
          name: "Steak",
          price: 2000,
          quantity: 1,
        });
        await ctx.db.insert("claims", {
          sessionId,
          itemId: guestItemId,
          participantId: guestId,
        });
        await ctx.db.insert("fees", {
          sessionId,
          label: "Tax",
          amount: 400,
        });
      });

      await t.mutation(api.claims.claim, {
        sessionId,
        itemId,
        participantId: hostId,
        secret: "host-secret",
      });

      const totals = await t.query(api.participants.getTotals, { sessionId });
      const host = totals.participants.find((p) => p.name === "Host");
      const guest = totals.participants.find((p) => p.name === "Guest");
      expect(host?.subtotal).toBe(2000);
      expect(guest?.subtotal).toBe(2000);
      expect(host?.tax).toBe(200);
      expect(guest?.tax).toBe(200);
    });
  });
});
