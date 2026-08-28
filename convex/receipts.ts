import { mutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireHost } from "./auth";
import { ALLOWED_IMAGE_TYPES, MAX_RECEIPT_BYTES } from "./validation";

// Step 1: Generate a short-lived upload URL for receipt images.
//
// Host-only, and scoped to a session. Handing this out unauthenticated made the
// deployment's file storage writable by anyone who could reach the endpoint -
// free hosting for arbitrary content, billed to this account.
export const generateUploadUrl = mutation({
  args: {
    sessionId: v.id("sessions"),
    participantId: v.id("participants"),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    await requireHost(
      ctx,
      args.sessionId,
      args.participantId,
      args.secret,
      "upload a receipt",
    );
    return await ctx.storage.generateUploadUrl();
  },
});

// Step 2: Save the storage ID to the session after upload
export const saveReceiptImage = mutation({
  args: {
    sessionId: v.id("sessions"),
    participantId: v.id("participants"),
    secret: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await requireHost(
      ctx,
      args.sessionId,
      args.participantId,
      args.secret,
      "upload a receipt",
    );

    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    // The upload URL itself cannot enforce a size or a type, so the file is
    // vetted here - before it is attached to a session and before the OCR
    // action will agree to read it.
    const metadata = await ctx.db.system.get(args.storageId);
    if (!metadata) {
      throw new Error("Uploaded file not found");
    }
    if (metadata.size > MAX_RECEIPT_BYTES) {
      throw new Error(
        `Receipt image is too large (max ${MAX_RECEIPT_BYTES / (1024 * 1024)}MB)`,
      );
    }
    if (
      !metadata.contentType ||
      !(ALLOWED_IMAGE_TYPES as readonly string[]).includes(metadata.contentType)
    ) {
      throw new Error("Receipt must be a JPEG, PNG, GIF, or WebP image");
    }

    // Replacing the receipt drops the old file rather than orphaning it in
    // storage, where nothing would ever collect it.
    const previousImageId = session.receiptImageId;

    await ctx.db.patch(args.sessionId, {
      receiptImageId: args.storageId,
    });

    if (previousImageId && previousImageId !== args.storageId) {
      await ctx.storage.delete(previousImageId);
    }

    return args.storageId;
  },
});

// Step 3: Get the serving URL for a stored receipt (with session verification)
export const getReceiptUrl = query({
  args: {
    sessionId: v.id("sessions"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    // Verify the storageId belongs to this session
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    if (session.receiptImageId !== args.storageId) {
      throw new Error("Receipt image not found for this session");
    }
    return await ctx.storage.getUrl(args.storageId);
  },
});

/**
 * Authorize an OCR run.
 *
 * Actions have no database access, so the parseReceipt action calls this to
 * establish two things it cannot check itself: that the caller hosts the
 * session, and that the file they named is that session's own receipt. Without
 * the second check, a valid host of any bill could point the vision model at
 * any file in the deployment's storage and read back its contents.
 */
export const assertCanParseReceipt = internalQuery({
  args: {
    sessionId: v.id("sessions"),
    participantId: v.id("participants"),
    secret: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await requireHost(
      ctx,
      args.sessionId,
      args.participantId,
      args.secret,
      "scan a receipt",
    );

    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    if (session.receiptImageId !== args.storageId) {
      throw new Error("Receipt image not found for this session");
    }
    return true;
  },
});
