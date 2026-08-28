import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

const HOST_SECRET = "host-secret";
const GUEST_SECRET = "guest-secret";

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
      secret: HOST_SECRET,
    });
    const guestId = await ctx.db.insert("participants", {
      sessionId,
      name: "Guest",
      isHost: false,
      joinedAt: Date.now() + 1,
      secret: GUEST_SECRET,
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
        secret: GUEST_SECRET,
        paymentMethod: "venmo",
        paymentHandle: "  @jeremie-h ",
      });

      const guest = await t.run(async (ctx) => ctx.db.get(guestId));
      expect(guest?.paymentHandle).toBe("jeremie-h");
      expect(guest?.paymentMethod).toBe("venmo");
    });

    it("stops someone redirecting another person's repayment to their own handle", async () => {
      const t = convexTest(schema);
      const { guestId } = await setup(t);

      // The attacker has the roster, so they have the guest's participant ID.
      // What they do not have is the guest's secret.
      await expect(
        t.mutation(api.participants.setPaymentInfo, {
          participantId: guestId,
          secret: HOST_SECRET,
          paymentMethod: "venmo",
          paymentHandle: "attacker",
        }),
      ).rejects.toThrow("Not authorized for this bill");
    });

    it("rejects a handle that would break out of the payment URL", async () => {
      const t = convexTest(schema);
      const { guestId } = await setup(t);

      await expect(
        t.mutation(api.participants.setPaymentInfo, {
          participantId: guestId,
          secret: GUEST_SECRET,
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
        secret: GUEST_SECRET,
        paymentMethod: "cashapp",
        paymentHandle: "someone",
      });
      await t.mutation(api.participants.setPaymentInfo, {
        participantId: guestId,
        secret: GUEST_SECRET,
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
        secret: GUEST_SECRET,
        isReady: true,
      });
      expect(
        await t.run(async (ctx) => (await ctx.db.get(guestId))?.isReady),
      ).toBe(true);

      await t.mutation(api.participants.setReady, {
        participantId: guestId,
        secret: GUEST_SECRET,
        isReady: false,
      });
      expect(
        await t.run(async (ctx) => (await ctx.db.get(guestId))?.isReady),
      ).toBe(false);
    });

    it("stops someone marking another person done claiming", async () => {
      const t = convexTest(schema);
      const { guestId } = await setup(t);

      await expect(
        t.mutation(api.participants.setReady, {
          participantId: guestId,
          secret: HOST_SECRET,
          isReady: true,
        }),
      ).rejects.toThrow("Not authorized for this bill");
    });
  });

  describe("setPaid", () => {
    it("lets the host confirm someone else's payment", async () => {
      const t = convexTest(schema);
      const { hostId, guestId } = await setup(t);

      await t.mutation(api.participants.setPaid, {
        participantId: guestId,
        callerParticipantId: hostId,
        secret: HOST_SECRET,
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
          secret: "other-secret",
        }),
      );

      await expect(
        t.mutation(api.participants.setPaid, {
          participantId: otherGuestId,
          callerParticipantId: guestId,
          secret: GUEST_SECRET,
          paid: false,
        }),
      ).rejects.toThrow("Not authorized to update this participant");
    });

    it("rejects a caller claiming to be the host without the host's secret", async () => {
      const t = convexTest(schema);
      const { hostId, guestId } = await setup(t);

      await expect(
        t.mutation(api.participants.setPaid, {
          participantId: guestId,
          callerParticipantId: hostId,
          secret: GUEST_SECRET,
          paid: true,
        }),
      ).rejects.toThrow("Not authorized for this bill");
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
          secret: "outsider-secret",
        });
      });

      await expect(
        t.mutation(api.participants.setPaid, {
          participantId: guestId,
          callerParticipantId: outsiderId,
          secret: "outsider-secret",
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
        secret: GUEST_SECRET,
        paid: true,
      });
      await t.mutation(api.participants.setPaid, {
        participantId: guestId,
        callerParticipantId: guestId,
        secret: GUEST_SECRET,
        paid: false,
      });

      const guest = await t.run(async (ctx) => ctx.db.get(guestId));
      expect(guest?.paidAt).toBeUndefined();
    });
  });

  describe("getTotals", () => {
    it("exposes settle-up state without ever exposing a secret", async () => {
      const t = convexTest(schema);
      const { sessionId, guestId } = await setup(t);

      await t.mutation(api.participants.setPaymentInfo, {
        participantId: guestId,
        secret: GUEST_SECRET,
        paymentMethod: "venmo",
        paymentHandle: "guest-handle",
      });

      const totals = await t.query(api.participants.getTotals, { sessionId });
      const guest = totals.participants.find((p) => p.name === "Guest")!;

      expect(guest.paymentHandle).toBe("guest-handle");
      expect(guest.paymentMethod).toBe("venmo");
      for (const person of totals.participants) {
        expect(person).not.toHaveProperty("secret");
      }
    });
  });
});
