import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

describe("sessions authorization", () => {
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
          secret: "hostParticipantId-secret",
        });
        return { sessionId, hostParticipantId };
      });

      // Action: Host updates tip
      await t.mutation(api.sessions.updateTip, {
        sessionId,
        participantId: hostParticipantId,
        secret: "hostParticipantId-secret",
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
          secret: "nonHostParticipantId-secret",
        });
        return { sessionId, nonHostParticipantId };
      });

      // Action & Verify: Non-host cannot update tip
      await expect(
        t.mutation(api.sessions.updateTip, {
          sessionId,
          participantId: nonHostParticipantId,
          secret: "nonHostParticipantId-secret",
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
          secret: "otherSessionHostId-secret",
        });

        return { sessionId, otherSessionHostId };
      });

      // Action & Verify: Host from other session cannot update tip
      await expect(
        t.mutation(api.sessions.updateTip, {
          sessionId,
          participantId: otherSessionHostId,
          secret: "otherSessionHostId-secret",
          tipType: "percent_subtotal",
          tipValue: 18,
        }),
      ).rejects.toThrow("Not authorized for this bill");
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
          secret: "hostParticipantId-secret",
        });
        return { sessionId, hostParticipantId };
      });

      // Action: Host updates tax
      await t.mutation(api.sessions.updateTax, {
        sessionId,
        participantId: hostParticipantId,
        secret: "hostParticipantId-secret",
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
          secret: "nonHostParticipantId-secret",
        });
        return { sessionId, nonHostParticipantId };
      });

      // Action & Verify: Non-host cannot update tax
      await expect(
        t.mutation(api.sessions.updateTax, {
          sessionId,
          participantId: nonHostParticipantId,
          secret: "nonHostParticipantId-secret",
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
          secret: "otherSessionHostId-secret",
        });

        return { sessionId, otherSessionHostId };
      });

      // Action & Verify: Host from other session cannot update tax
      await expect(
        t.mutation(api.sessions.updateTax, {
          sessionId,
          participantId: otherSessionHostId,
          secret: "otherSessionHostId-secret",
          tax: 850,
        }),
      ).rejects.toThrow("Not authorized for this bill");
    });
  });
  describe("listByCodes", () => {
    it("returns the merchant for a bill the caller did not upload the receipt for", async () => {
      const t = convexTest(schema);
      // Host uploaded the receipt, so only their device cached the merchant.
      // A guest's device knows the code and nothing else.
      await t.run(async (ctx) => {
        await ctx.db.insert("sessions", {
          code: "ABC123",
          hostName: "Host",
          createdAt: Date.now(),
          merchant: "Joe's Diner",
        });
      });

      const sessions = await t.query(api.sessions.listByCodes, {
        codes: ["ABC123"],
      });

      expect(sessions).toEqual([{ code: "ABC123", merchant: "Joe's Diner" }]);
    });

    it("omits the merchant when no receipt has been parsed yet", async () => {
      const t = convexTest(schema);
      await t.run(async (ctx) => {
        await ctx.db.insert("sessions", {
          code: "ABC123",
          hostName: "Host",
          createdAt: Date.now(),
        });
      });

      const sessions = await t.query(api.sessions.listByCodes, {
        codes: ["ABC123"],
      });

      expect(sessions).toEqual([{ code: "ABC123", merchant: undefined }]);
    });

    it("looks up several codes at once and normalizes them", async () => {
      const t = convexTest(schema);
      await t.run(async (ctx) => {
        await ctx.db.insert("sessions", {
          code: "ABC123",
          hostName: "A",
          createdAt: Date.now(),
          merchant: "Joe's Diner",
        });
        await ctx.db.insert("sessions", {
          code: "XYZ789",
          hostName: "B",
          createdAt: Date.now(),
          merchant: "Taco Stand",
        });
      });

      const sessions = await t.query(api.sessions.listByCodes, {
        codes: ["  abc123 ", "XYZ789", "ABC123"],
      });

      expect(sessions).toHaveLength(2);
      expect(sessions).toContainEqual({
        code: "ABC123",
        merchant: "Joe's Diner",
      });
      expect(sessions).toContainEqual({
        code: "XYZ789",
        merchant: "Taco Stand",
      });
    });

    it("skips codes with no matching bill instead of failing", async () => {
      const t = convexTest(schema);
      await t.run(async (ctx) => {
        await ctx.db.insert("sessions", {
          code: "ABC123",
          hostName: "Host",
          createdAt: Date.now(),
          merchant: "Joe's Diner",
        });
      });

      const sessions = await t.query(api.sessions.listByCodes, {
        codes: ["ABC123", "GONE12"],
      });

      expect(sessions).toEqual([{ code: "ABC123", merchant: "Joe's Diner" }]);
    });

    it("returns nothing for an empty code list", async () => {
      const t = convexTest(schema);
      expect(await t.query(api.sessions.listByCodes, { codes: [] })).toEqual(
        [],
      );
    });

    it("rejects an oversized batch", async () => {
      const t = convexTest(schema);
      await expect(
        t.query(api.sessions.listByCodes, {
          codes: Array.from({ length: 51 }, (_, i) => `CODE${i}`),
        }),
      ).rejects.toThrow("Too many codes");
    });
  });
});
