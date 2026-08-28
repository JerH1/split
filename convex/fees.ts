import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireHost } from "./auth";
import {
  MAX_FEES_PER_SESSION,
  stripInvisible,
  validateMoney,
} from "./validation";

// Max label length for fee labels
const MAX_FEE_LABEL_LENGTH = 100;

/**
 * Validate and trim a fee label.
 * Fee labels are the exact text from receipts (e.g., "Philadelphia Liquor Tax").
 */
function validateFeeLabel(label: string): string {
  const trimmed = stripInvisible(label).trim();
  if (trimmed.length === 0) {
    throw new Error("Fee label cannot be empty");
  }
  if (trimmed.length > MAX_FEE_LABEL_LENGTH) {
    throw new Error(
      `Fee label cannot exceed ${MAX_FEE_LABEL_LENGTH} characters`,
    );
  }
  return trimmed;
}

// List all fees in a session
export const listBySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("fees")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
  },
});

// Add a fee (host only)
export const add = mutation({
  args: {
    sessionId: v.id("sessions"),
    participantId: v.id("participants"),
    secret: v.string(),
    label: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    await requireHost(
      ctx,
      args.sessionId,
      args.participantId,
      args.secret,
      "add fees",
    );

    // Cap the list, same as the bulk path
    const existingFees = await ctx.db
      .query("fees")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    if (existingFees.length >= MAX_FEES_PER_SESSION) {
      throw new Error(`Too many fees (max ${MAX_FEES_PER_SESSION})`);
    }

    // Validate inputs
    const validatedLabel = validateFeeLabel(args.label);
    const validatedAmount = validateMoney(args.amount, "Fee amount");

    const feeId = await ctx.db.insert("fees", {
      sessionId: args.sessionId,
      label: validatedLabel,
      amount: validatedAmount,
    });
    return feeId;
  },
});

// Bulk add fees (from OCR) - replaces existing fees for the session (host only)
export const addBulk = mutation({
  args: {
    sessionId: v.id("sessions"),
    participantId: v.id("participants"),
    secret: v.string(),
    fees: v.array(
      v.object({
        label: v.string(),
        amount: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    // Validate array length to prevent DoS
    if (args.fees.length > MAX_FEES_PER_SESSION) {
      throw new Error(`Too many fees (max ${MAX_FEES_PER_SESSION})`);
    }

    await requireHost(
      ctx,
      args.sessionId,
      args.participantId,
      args.secret,
      "replace all fees",
    );

    // Validate all fees before making any changes
    const validatedFees = args.fees.map((fee) => ({
      label: validateFeeLabel(fee.label),
      amount: validateMoney(fee.amount, "Fee amount"),
    }));

    // Delete all existing fees for this session
    const existingFees = await ctx.db
      .query("fees")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    for (const fee of existingFees) {
      await ctx.db.delete(fee._id);
    }

    // Insert the validated fees
    const feeIds = [];
    for (const fee of validatedFees) {
      const feeId = await ctx.db.insert("fees", {
        sessionId: args.sessionId,
        label: fee.label,
        amount: fee.amount,
      });
      feeIds.push(feeId);
    }
    return feeIds;
  },
});

// Update a fee (host only)
export const update = mutation({
  args: {
    feeId: v.id("fees"),
    participantId: v.id("participants"),
    secret: v.string(),
    label: v.optional(v.string()),
    amount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Verify fee exists
    const fee = await ctx.db.get(args.feeId);
    if (!fee) {
      throw new Error("Fee not found");
    }

    // Host of the fee's own session
    await requireHost(
      ctx,
      fee.sessionId,
      args.participantId,
      args.secret,
      "update fees",
    );

    // Validate and build updates
    const updates: Record<string, unknown> = {};
    if (args.label !== undefined) {
      updates.label = validateFeeLabel(args.label);
    }
    if (args.amount !== undefined) {
      updates.amount = validateMoney(args.amount, "Fee amount");
    }

    await ctx.db.patch(args.feeId, updates);
  },
});

// Remove a fee (host only)
export const remove = mutation({
  args: {
    feeId: v.id("fees"),
    participantId: v.id("participants"),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify fee exists
    const fee = await ctx.db.get(args.feeId);
    if (!fee) {
      throw new Error("Fee not found");
    }

    // Host of the fee's own session
    await requireHost(
      ctx,
      fee.sessionId,
      args.participantId,
      args.secret,
      "remove fees",
    );

    await ctx.db.delete(args.feeId);
  },
});
