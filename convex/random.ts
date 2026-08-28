// convex/random.ts
// Cryptographically secure randomness for values that act as credentials.
//
// With no accounts, a session code and a participant secret are the only things
// standing between a bill and a stranger, so both must come from a CSPRNG.
// Math.random() is not one: its internal state is recoverable from a handful of
// observed outputs, so anyone who created a few bills of their own could derive
// the codes being handed out to everyone else.

// 32 characters exactly, omitting the pairs people mistype (0/O, 1/I/L).
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const SECRET_BYTES = 24; // 192 bits

function randomBytes(count: number): Uint8Array {
  const bytes = new Uint8Array(count);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * A share code for a new session.
 *
 * The alphabet is exactly 32 characters, so masking a byte down to its low 5
 * bits draws uniformly from it — no modulo bias, no rejection sampling.
 */
export function randomCode(length: number = 6): string {
  let code = "";
  for (const byte of randomBytes(length)) {
    code += CODE_ALPHABET[byte & 31];
  }
  return code;
}

/**
 * A participant's bearer secret, as lowercase hex.
 *
 * Participant IDs are public — every client receives them in order to render
 * the roster and attribute claims — so the ID alone cannot authorize anything.
 * This secret is returned once, at create/join time, and never appears in a
 * query result again.
 */
export function randomSecret(): string {
  let secret = "";
  for (const byte of randomBytes(SECRET_BYTES)) {
    secret += byte.toString(16).padStart(2, "0");
  }
  return secret;
}
