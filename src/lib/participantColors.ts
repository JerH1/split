/**
 * Every participant owns one colour for the life of the bill — chips, claims,
 * totals. Assignment is by join order so it is stable and identical on every
 * device without storing anything.
 *
 * There are four; a fifth participant reuses the first colour. Names are always
 * shown next to the colour, so a repeat is a wrinkle rather than an ambiguity.
 */

export const PERSON_COLOR_COUNT = 4;

interface Joinable {
  _id: string;
  joinedAt: number;
}

/** 0-based colour slot for a participant, or null when they aren't in the bill. */
export function personColorIndex(
  participants: Joinable[],
  participantId: string | null | undefined,
): number | null {
  if (!participantId) return null;
  const ordered = [...participants].sort((a, b) => a.joinedAt - b.joinedAt);
  const at = ordered.findIndex((p) => p._id === participantId);
  return at === -1 ? null : at % PERSON_COLOR_COUNT;
}

/** A CSS colour for a slot, falling back to the muted ink when there is none. */
export function personColorVar(index: number | null): string {
  if (index === null) return "var(--ink-3)";
  return `var(--person-${(index % PERSON_COLOR_COUNT) + 1})`;
}

/** Convenience for the common "look this person up and give me their colour". */
export function personColor(
  participants: Joinable[],
  participantId: string | null | undefined,
): string {
  return personColorVar(personColorIndex(participants, participantId));
}

/** First letter of a name, for the round avatar chips. */
export function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}
