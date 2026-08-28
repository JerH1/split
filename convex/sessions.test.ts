import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

describe("sessions authorization", () => {
  // Test fixtures
  let sessionId: Id<"sessions">;
  let hostParticipantId: Id<"participants">;
  let nonHostParticipantId: Id<"participants">;
  let otherSessionId: Id<"sessions">;
  let otherSessionHostId: Id<"participants">;

  describe("updateTip", () => {
    it("allows host to update tip (BTEST-03, BTEST-07)", async () => {
      const t = convexTest(schema);

      // Setup: Create session with host
      const { sessionId, hostParticipantId } = await t.run(async (ctx) => {
        const sessionId = await ctx.db.insert("sessions", {
          code: "ABC123",
          hostName: "Host",
          createdAt: Date.now(),
        });
        const hostParticipantId = await ctx.db.insert("participants", {
          sessionId,
          name: "Host",
          isHost: true,
          joinedAt: Date.now(),
        });
        return { sessionId, hostParticipantId };
      });

      // Action: Host updates tip
      await t.mutation(api.sessions.updateTip, {
        sessionId,
        participantId: hostParticipantId,
        tipType: "percent_subtotal",
        tipValue: 18,
      });

      // Verify: Session has updated tip settings
      const session = await t.run(async (ctx) => ctx.db.get(sessionId));
      expect(session?.tipType).toBe("percent_subtotal");
      expect(session?.tipValue).toBe(18);
    });

    it("rejects non-host updating tip (BTEST-03)", async () => {
      const t = convexTest(schema);

      // Setup: Create session with host and non-host participant
      const { sessionId, nonHostParticipantId } = await t.run(async (ctx) => {
        const sessionId = await ctx.db.insert("sessions", {
          code: "ABC123",
          hostName: "Host",
          createdAt: Date.now(),
        });
        await ctx.db.insert("participants", {
          sessionId,
          name: "Host",
          isHost: true,
          joinedAt: Date.now(),
        });
        const nonHostParticipantId = await ctx.db.insert("participants", {
          sessionId,
          name: "Guest",
          isHost: false,
          joinedAt: Date.now(),
        });
        return { sessionId, nonHostParticipantId };
      });

      // Action & Verify: Non-host cannot update tip
      await expect(
        t.mutation(api.sessions.updateTip, {
          sessionId,
          participantId: nonHostParticipantId,
          tipType: "percent_subtotal",
          tipValue: 18,
        }),
      ).rejects.toThrow("Only the host can modify bill settings");
    });

    it("rejects cross-session tip update (BTEST-09)", async () => {
      const t = convexTest(schema);

      // Setup: Create two sessions, each with host
      const { sessionId, otherSessionHostId } = await t.run(async (ctx) => {
        // Session 1
        const sessionId = await ctx.db.insert("sessions", {
          code: "ABC123",
          hostName: "Host1",
          createdAt: Date.now(),
        });
        await ctx.db.insert("participants", {
          sessionId,
          name: "Host1",
          isHost: true,
          joinedAt: Date.now(),
        });

        // Session 2
        const otherSessionId = await ctx.db.insert("sessions", {
          code: "XYZ789",
          hostName: "Host2",
          createdAt: Date.now(),
        });
        const otherSessionHostId = await ctx.db.insert("participants", {
          sessionId: otherSessionId,
          name: "Host2",
          isHost: true,
          joinedAt: Date.now(),
        });

        return { sessionId, otherSessionHostId };
      });

      // Action & Verify: Host from other session cannot update tip
      await expect(
        t.mutation(api.sessions.updateTip, {
          sessionId,
          participantId: otherSessionHostId,
          tipType: "percent_subtotal",
          tipValue: 18,
        }),
      ).rejects.toThrow("Participant not in this session");
    });
  });

  describe("updateTax", () => {
    it("allows host to update tax (BTEST-04, BTEST-07)", async () => {
      const t = convexTest(schema);

      // Setup: Create session with host
      const { sessionId, hostParticipantId } = await t.run(async (ctx) => {
        const sessionId = await ctx.db.insert("sessions", {
          code: "ABC123",
          hostName: "Host",
          createdAt: Date.now(),
        });
        const hostParticipantId = await ctx.db.insert("participants", {
          sessionId,
          name: "Host",
          isHost: true,
          joinedAt: Date.now(),
        });
        return { sessionId, hostParticipantId };
      });

      // Action: Host updates tax
      await t.mutation(api.sessions.updateTax, {
        sessionId,
        participantId: hostParticipantId,
        tax: 850, // $8.50 in cents
      });

      // Verify: Session has updated tax
      const session = await t.run(async (ctx) => ctx.db.get(sessionId));
      expect(session?.tax).toBe(850);
    });

    it("rejects non-host updating tax (BTEST-04)", async () => {
      const t = convexTest(schema);

      // Setup: Create session with host and non-host participant
      const { sessionId, nonHostParticipantId } = await t.run(async (ctx) => {
        const sessionId = await ctx.db.insert("sessions", {
          code: "ABC123",
          hostName: "Host",
          createdAt: Date.now(),
        });
        await ctx.db.insert("participants", {
          sessionId,
          name: "Host",
          isHost: true,
          joinedAt: Date.now(),
        });
        const nonHostParticipantId = await ctx.db.insert("participants", {
          sessionId,
          name: "Guest",
          isHost: false,
          joinedAt: Date.now(),
        });
        return { sessionId, nonHostParticipantId };
      });

      // Action & Verify: Non-host cannot update tax
      await expect(
        t.mutation(api.sessions.updateTax, {
          sessionId,
          participantId: nonHostParticipantId,
          tax: 850,
        }),
      ).rejects.toThrow("Only the host can modify bill settings");
    });

    it("rejects cross-session tax update (BTEST-09)", async () => {
      const t = convexTest(schema);

      // Setup: Create two sessions
      const { sessionId, otherSessionHostId } = await t.run(async (ctx) => {
        // Session 1
        const sessionId = await ctx.db.insert("sessions", {
          code: "ABC123",
          hostName: "Host1",
          createdAt: Date.now(),
        });
        await ctx.db.insert("participants", {
          sessionId,
          name: "Host1",
          isHost: true,
          joinedAt: Date.now(),
        });

        // Session 2
        const otherSessionId = await ctx.db.insert("sessions", {
          code: "XYZ789",
          hostName: "Host2",
          createdAt: Date.now(),
        });
        const otherSessionHostId = await ctx.db.insert("participants", {
          sessionId: otherSessionId,
          name: "Host2",
          isHost: true,
          joinedAt: Date.now(),
        });

        return { sessionId, otherSessionHostId };
      });

      // Action & Verify: Host from other session cannot update tax
      await expect(
        t.mutation(api.sessions.updateTax, {
          sessionId,
          participantId: otherSessionHostId,
          tax: 850,
        }),
      ).rejects.toThrow("Participant not in this session");
    });
  });
  describe("deleteByCode", () => {
    // Build a session with one of every child row so cascade behavior is visible
    async function seedFullSession(t: ReturnType<typeof convexTest>) {
      return await t.run(async (ctx) => {
        const sessionId = await ctx.db.insert("sessions", {
          code: "ABC123",
          hostName: "Host",
          createdAt: Date.now(),
        });
        const hostParticipantId = await ctx.db.insert("participants", {
          sessionId,
          name: "Host",
          isHost: true,
          joinedAt: Date.now(),
        });
        const guestParticipantId = await ctx.db.insert("participants", {
          sessionId,
          name: "Guest",
          isHost: false,
          joinedAt: Date.now(),
        });
        const itemId = await ctx.db.insert("items", {
          sessionId,
          name: "Burger",
          price: 1200,
          quantity: 1,
        });
        await ctx.db.insert("claims", {
          sessionId,
          itemId,
          participantId: guestParticipantId,
        });
        await ctx.db.insert("fees", {
          sessionId,
          label: "Sales Tax",
          amount: 100,
        });
        return { sessionId, hostParticipantId, guestParticipantId };
      });
    }

    async function countAllRows(t: ReturnType<typeof convexTest>) {
      return await t.run(async (ctx) => ({
        sessions: (await ctx.db.query("sessions").collect()).length,
        participants: (await ctx.db.query("participants").collect()).length,
        items: (await ctx.db.query("items").collect()).length,
        claims: (await ctx.db.query("claims").collect()).length,
        fees: (await ctx.db.query("fees").collect()).length,
      }));
    }

    it("allows host to delete the bill", async () => {
      const t = convexTest(schema);
      const { hostParticipantId } = await seedFullSession(t);

      await t.mutation(api.sessions.deleteByCode, {
        code: "ABC123",
        participantId: hostParticipantId,
      });

      const session = await t.run(async (ctx) =>
        ctx.db
          .query("sessions")
          .withIndex("by_code", (q) => q.eq("code", "ABC123"))
          .first(),
      );
      expect(session).toBeNull();
    });

    it("deletes every child row, leaving nothing orphaned", async () => {
      const t = convexTest(schema);
      const { hostParticipantId } = await seedFullSession(t);

      await t.mutation(api.sessions.deleteByCode, {
        code: "ABC123",
        participantId: hostParticipantId,
      });

      expect(await countAllRows(t)).toEqual({
        sessions: 0,
        participants: 0,
        items: 0,
        claims: 0,
        fees: 0,
      });
    });

    it("deletes the uploaded receipt image from file storage", async () => {
      const t = convexTest(schema);
      const { sessionId, hostParticipantId } = await seedFullSession(t);

      const storageId = await t.run(async (ctx) => {
        const storageId = await ctx.storage.store(
          new Blob(["receipt bytes"], { type: "image/jpeg" }),
        );
        await ctx.db.patch(sessionId, { receiptImageId: storageId });
        return storageId;
      });

      await t.mutation(api.sessions.deleteByCode, {
        code: "ABC123",
        participantId: hostParticipantId,
      });

      const url = await t.run(async (ctx) => ctx.storage.getUrl(storageId));
      expect(url).toBeNull();
    });

    it("rejects a non-host participant and leaves the bill intact", async () => {
      const t = convexTest(schema);
      const { guestParticipantId } = await seedFullSession(t);

      await expect(
        t.mutation(api.sessions.deleteByCode, {
          code: "ABC123",
          participantId: guestParticipantId,
        }),
      ).rejects.toThrow("Only the host can delete this bill");

      expect(await countAllRows(t)).toEqual({
        sessions: 1,
        participants: 2,
        items: 1,
        claims: 1,
        fees: 1,
      });
    });

    it("rejects a host of a different session", async () => {
      const t = convexTest(schema);
      await seedFullSession(t);

      const otherSessionHostId = await t.run(async (ctx) => {
        const otherSessionId = await ctx.db.insert("sessions", {
          code: "XYZ789",
          hostName: "Host2",
          createdAt: Date.now(),
        });
        return await ctx.db.insert("participants", {
          sessionId: otherSessionId,
          name: "Host2",
          isHost: true,
          joinedAt: Date.now(),
        });
      });

      await expect(
        t.mutation(api.sessions.deleteByCode, {
          code: "ABC123",
          participantId: otherSessionHostId,
        }),
      ).rejects.toThrow("Participant not in this session");

      const session = await t.run(async (ctx) =>
        ctx.db
          .query("sessions")
          .withIndex("by_code", (q) => q.eq("code", "ABC123"))
          .first(),
      );
      expect(session).not.toBeNull();
    });

    it("normalizes the code before looking up the session", async () => {
      const t = convexTest(schema);
      const { hostParticipantId } = await seedFullSession(t);

      await t.mutation(api.sessions.deleteByCode, {
        code: "  abc123  ",
        participantId: hostParticipantId,
      });

      expect((await countAllRows(t)).sessions).toBe(0);
    });

    it("is a no-op for a code that does not exist", async () => {
      const t = convexTest(schema);
      const { hostParticipantId } = await seedFullSession(t);

      await t.mutation(api.sessions.deleteByCode, {
        code: "NOSUCH",
        participantId: hostParticipantId,
      });

      expect((await countAllRows(t)).sessions).toBe(1);
    });
  });
});
