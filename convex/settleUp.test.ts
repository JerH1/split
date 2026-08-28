import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

async function setup(t: ReturnType<typeof convexTest>) {
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
      joinedAt: Date.now(),
    });
    const guestId = await ctx.db.insert("participants", {
      sessionId,
      name: "Guest",
      isHost: false,
      joinedAt: Date.now() + 1,
    });
    return { sessionId, hostId, guestId };
  });
}

describe("settle up", () => {
  describe("setPaymentInfo", () => {
    it("stores a handle without the leading @ people type", async () => {
      const t = convexTest(schema);
      const { guestId } = await setup(t);

      await t.mutation(api.participants.setPaymentInfo, {
        participantId: guestId,
        paymentMethod: "venmo",
        paymentHandle: "  @jeremie-h ",
      });

      const guest = await t.run(async (ctx) => ctx.db.get(guestId));
      expect(guest?.paymentHandle).toBe("jeremie-h");
      expect(guest?.paymentMethod).toBe("venmo");
    });

    it("rejects a handle that would break out of the payment URL", async () => {
      const t = convexTest(schema);
      const { guestId } = await setup(t);

      await expect(
        t.mutation(api.participants.setPaymentInfo, {
          participantId: guestId,
          paymentMethod: "venmo",
          paymentHandle: "victim/../attacker?amount=999",
        }),
      ).rejects.toThrow("can only contain letters, numbers");
    });

    it("clears both fields when the handle is emptied", async () => {
      const t = convexTest(schema);
      const { guestId } = await setup(t);

      await t.mutation(api.participants.setPaymentInfo, {
        participantId: guestId,
        paymentMethod: "cashapp",
        paymentHandle: "someone",
      });
      await t.mutation(api.participants.setPaymentInfo, {
        participantId: guestId,
        paymentMethod: "cashapp",
        paymentHandle: "",
      });

      const guest = await t.run(async (ctx) => ctx.db.get(guestId));
      expect(guest?.paymentHandle).toBeUndefined();
      expect(guest?.paymentMethod).toBeUndefined();
    });
  });

  describe("setReady", () => {
    it("records that someone is done claiming, and lets them undo it", async () => {
      const t = convexTest(schema);
      const { guestId } = await setup(t);

      await t.mutation(api.participants.setReady, {
        participantId: guestId,
        isReady: true,
      });
      expect(
        await t.run(async (ctx) => (await ctx.db.get(guestId))?.isReady),
      ).toBe(true);

      await t.mutation(api.participants.setReady, {
        participantId: guestId,
        isReady: false,
      });
      expect(
        await t.run(async (ctx) => (await ctx.db.get(guestId))?.isReady),
      ).toBe(false);
    });
  });

  describe("setPaid", () => {
    it("lets the host confirm someone else's payment", async () => {
      const t = convexTest(schema);
      const { hostId, guestId } = await setup(t);

      await t.mutation(api.participants.setPaid, {
        participantId: guestId,
        callerParticipantId: hostId,
        paid: true,
      });

      const guest = await t.run(async (ctx) => ctx.db.get(guestId));
      expect(guest?.paidAt).toEqual(expect.any(Number));
    });

    it("rejects a guest marking another guest paid", async () => {
      const t = convexTest(schema);
      const { sessionId, guestId } = await setup(t);
      const otherGuestId = await t.run(async (ctx) =>
        ctx.db.insert("participants", {
          sessionId,
          name: "Other",
          isHost: false,
          joinedAt: Date.now() + 2,
        }),
      );

      await expect(
        t.mutation(api.participants.setPaid, {
          participantId: otherGuestId,
          callerParticipantId: guestId,
          paid: false,
        }),
      ).rejects.toThrow("Not authorized to update this participant");
    });

    it("rejects a caller from a different bill", async () => {
      const t = convexTest(schema);
      const { guestId } = await setup(t);
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
        });
      });

      await expect(
        t.mutation(api.participants.setPaid, {
          participantId: guestId,
          callerParticipantId: outsiderId,
          paid: true,
        }),
      ).rejects.toThrow("Not authorized to update this participant");
    });

    it("clears the timestamp when a payment is un-marked", async () => {
      const t = convexTest(schema);
      const { guestId } = await setup(t);

      await t.mutation(api.participants.setPaid, {
        participantId: guestId,
        callerParticipantId: guestId,
        paid: true,
      });
      await t.mutation(api.participants.setPaid, {
        participantId: guestId,
        callerParticipantId: guestId,
        paid: false,
      });

      const guest = await t.run(async (ctx) => ctx.db.get(guestId));
      expect(guest?.paidAt).toBeUndefined();
    });
  });
});
