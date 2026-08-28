import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Sessions represent a bill-splitting event
  sessions: defineTable({
    code: v.string(), // 6-char alphanumeric code for sharing
    hostName: v.string(), // Display name of session creator
    createdAt: v.number(), // Unix timestamp
    receiptImageId: v.optional(v.id("_storage")), // Convex file storage ID
    subtotal: v.optional(v.number()), // Parsed from receipt
    tax: v.optional(v.number()), // Parsed from receipt
    gratuity: v.optional(v.number()), // Auto-gratuity from receipt (in cents)
    merchant: v.optional(v.string()), // Parsed from receipt
    tipType: v.optional(
      v.union(
        v.literal("percent_subtotal"), // Tip on subtotal only
        v.literal("percent_total"), // Tip on subtotal + tax
        v.literal("manual"), // Manual dollar amount
      ),
    ),
    tipValue: v.optional(v.number()), // Percentage or dollar amount
    receiptTotal: v.optional(v.number()), // Grand total parsed from receipt, for reconciliation
    lockedAt: v.optional(v.number()), // Set when the host freezes the bill; undefined means open
  }).index("by_code", ["code"]), // Lookup sessions by share code

  // Participants are people in a session
  participants: defineTable({
    sessionId: v.id("sessions"),
    name: v.string(), // Display name
    isHost: v.boolean(), // Host has extra controls
    joinedAt: v.number(), // Unix timestamp
    // Bearer secret proving a caller *is* this participant. Participant IDs are
    // public (the roster and claim list ship them to every client), so the ID
    // alone authorizes nothing. Optional only so participants created before
    // secrets existed still validate; they can no longer be authenticated as.
    // See convex/auth.ts.
    secret: v.optional(v.string()),
    // How this person wants to be paid back. Both fields are set together or
    // not at all - a handle without a method has nowhere to link to.
    paymentMethod: v.optional(
      v.union(
        v.literal("venmo"),
        v.literal("cashapp"),
        v.literal("paypal"),
        v.literal("other"),
      ),
    ),
    paymentHandle: v.optional(v.string()), // Username/email, stored without a leading @
    isReady: v.optional(v.boolean()), // "I'm done claiming" - undefined means not ready
    paidAt: v.optional(v.number()), // Set when this person's share is settled
  }).index("by_session", ["sessionId"]), // List participants in a session

  // Items are line items from the receipt
  items: defineTable({
    sessionId: v.id("sessions"),
    name: v.string(), // Item description
    price: v.number(), // Price in cents (avoid floating point)
    quantity: v.number(), // Usually 1, but receipts may show "2 x $5.00"
  }).index("by_session", ["sessionId"]), // List items in a session

  // Claims link participants to items they're paying for
  claims: defineTable({
    sessionId: v.id("sessions"), // Denormalized for efficient queries
    itemId: v.id("items"),
    participantId: v.id("participants"),
  })
    .index("by_session", ["sessionId"]) // All claims in a session
    .index("by_item", ["itemId"]) // Who claimed this item?
    .index("by_participant", ["participantId"]), // What did this person claim?

  // Fees are tax and fee line items (multiple per session)
  fees: defineTable({
    sessionId: v.id("sessions"),
    label: v.string(), // Exact text from receipt (e.g., "Philadelphia Liquor Tax")
    amount: v.number(), // Amount in cents
  }).index("by_session", ["sessionId"]), // List fees in a session
});
