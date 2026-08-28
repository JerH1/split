# Architecture Overview

Split is a mobile-first bill splitting app with real-time collaborative editing. No authentication required - session codes provide access control.

## Data Model

```
sessions
  |-- code (6-char alphanumeric, shareable)
  |-- hostName
  |-- subtotal, tax, gratuity (in cents)
  |-- tipType, tipValue
  |
  +-- participants (by sessionId)
  |     |-- name
  |     |-- isHost (boolean)
  |     |-- joinedAt
  |     |-- secret (bearer credential, never leaves the server in a query)
  |
  +-- items (by sessionId)
  |     |-- name
  |     |-- price (in cents)
  |     |-- quantity
  |
  +-- claims (by sessionId, itemId, participantId)
        Links participants to items they're paying for
```

**Key relationships:**

- A session has many participants and items
- Claims are a many-to-many join between participants and items
- All tables include denormalized `sessionId` for efficient session-scoped queries

## Key Patterns

### Claims Model

Multiple participants can claim the same item. The price splits equally among all claimants.

```typescript
// $10 item claimed by 3 people = $3.34 + $3.33 + $3.33
const shares = calculateItemShare(1000, 3); // [334, 333, 333]
```

- First N claimants get the extra cents when division is uneven
- Unclaimed items show a warning but don't block the flow
- Claims stored as separate records (not an array) for efficient queries

### Real-time Sync (Convex)

All data changes broadcast automatically via Convex subscriptions.

```typescript
// This query automatically re-runs when any session data changes
const session = useQuery(api.sessions.get, { code });
```

- No manual polling or WebSocket management
- UI components subscribe to queries and update reactively
- Mutations trigger immediate optimistic updates

### Draft State for New Items

New items are created in local React state first, only saved to the database when the user finishes editing.

```typescript
// Local draft prevents empty items from appearing to other users
const [draft, setDraft] = useState<DraftItem | null>(null);
```

- Prevents "Item 1" placeholder from broadcasting
- Only one draft allowed at a time
- Draft commits to DB on blur/save

### Participant Verification

Identity rests on a per-participant secret, issued once by `sessions.create` or
`participants.join` and kept in localStorage alongside the participant ID.

A participant ID on its own proves nothing. The roster, the claim list, and the
summary all ship IDs to every client so the UI can attribute items to people, so
an ID is a public name. Only the secret is a credential, and no query ever
returns one.

```typescript
// convex/auth.ts - every mutation that acts on someone's behalf starts here
const participant = await requireHost(ctx, sessionId, participantId, secret);
```

- `requireParticipant` - the caller is who they claim to be
- `requireMember` - and they belong to the session being acted on
- `requireHost` - and they host _that_ session; `isHost` is never a global role
- Secrets are compared in constant time, and every identity failure returns the
  same message so the mutations cannot be used to probe which IDs exist
- Participants created before secrets existed have none and can no longer be
  authenticated as: those bills fail closed to read-only
- Authorization happens in Convex functions, not the frontend

### Money Handling

All prices stored as integers (cents) to avoid floating point issues.

```typescript
// Store: 1999 cents, not 19.99
// Display: (price / 100).toFixed(2) -> "19.99"
```

- Subtotal, tax, tip, gratuity all in cents
- Math operations use integer arithmetic
- Format only at display time

### Proportional Distribution

Tax and tip distributed by each participant's share of the claimed subtotal.

```typescript
// distributeWithRemainder ensures sum equals total exactly
const taxShares = distributeWithRemainder(totalTax, participantSubtotals);
```

- Uses largest-fractional-remainder method for rounding
- Guarantees no penny left behind or created
- Same helper used for tax, tip, and auto-gratuity

## Security Model

Two layers, because they answer different questions:

- **Session codes** gate _discovery_. Six characters drawn from a 32-symbol
  alphabet by `crypto.getRandomValues` (see `convex/random.ts`) - never
  `Math.random()`, whose state is recoverable from a few observed outputs.
- **Participant secrets** gate _identity_. Holding a code lets you join as a new
  person; it does not let you act as an existing one. See `convex/auth.ts`.

- **Authorization** checked in every mutation:
  - Host-only: tip/tax/merchant settings, fees, bulk item import, item removal,
    receipt upload and OCR
  - All participants: add and edit items, claim and unclaim their own share
  - Cross-session: every check is scoped to the record's own session, so hosting
    one bill confers nothing in another
- **Input validation** with bounds:
  - Names: 100 chars max; control, zero-width, and bidi characters stripped, and
    duplicates compared on an NFKC-folded key so lookalike spellings collide
  - Item names: 200 chars max
  - Money: $100,000 max, non-negative integers only
  - Quantity: 999 max
  - Per session: 50 participants, 500 items, 50 fees
- **Receipt storage**
  - Upload URLs are issued to the host of a named session, never anonymously
  - Uploads are checked against the stored file's real size and content type
    (10 MB, image types only) before being attached to a bill
  - The OCR action refuses any file that is not that session's own receipt, so
    it cannot be pointed at the rest of the deployment's storage
  - Replacing a receipt deletes the file it replaced

### Known gaps

- Nothing is rate limited. The code space is 32^6, and an attacker who can spray
  `sessions.getByCode` will eventually land on a live bill. `listByCodes` is
  capped at 10 per request to limit the amplification, but the real fix is a
  rate limiter (`@convex-dev/rate-limiter`) or a longer code.
- Sessions never expire and are never deleted, so a leaked code is good forever.

See `.planning/phases/11-security-review/SECURITY-AUDIT.md` for the full security audit.

## Key Files

| File                               | Purpose                          |
| ---------------------------------- | -------------------------------- |
| `convex/schema.ts`                 | Data model definition            |
| `convex/calculations.ts`           | Tax/tip distribution logic       |
| `convex/validation.ts`             | Input validation helpers         |
| `convex/claims.ts`                 | Claim/unclaim mutations          |
| `convex/sessions.ts`               | Session CRUD and code generation |
| `src/components/Summary.tsx`       | Per-person total breakdown       |
| `src/components/ClaimableItem.tsx` | Item claiming UI                 |
| `src/components/InlineItem.tsx`    | Inline item editing              |

## Design Decisions

Key decisions are documented in `.planning/STATE.md` under "Accumulated Context > Decisions". Notable ones:

- **No authentication** - Session codes are sufficient for casual bill splitting
- **Prices in cents** - Avoids floating point math errors
- **Denormalized sessionId** - Every table has sessionId for efficient scoped queries
- **Separate claims table** - Many-to-many allows item splitting without arrays
- **Draft state pattern** - Prevents incomplete items from broadcasting
