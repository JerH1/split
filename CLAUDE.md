# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (run in separate terminals)
npx convex dev          # Start Convex backend
npm run dev             # Start Vite frontend (http://localhost:5173)

# Build
npm run build           # TypeScript check + Vite build

# Testing
npm test                # Run unit tests (Vitest) once
npm run test:watch      # Run unit tests in watch mode
npm run test:e2e        # Run Playwright E2E tests
npm run test:all        # Run unit + E2E tests

# Lint
npm run lint            # Run ESLint

# Preview link (fork-specific convenience)
npm run alias           # Point the friendly domain at this branch's newest build
```

`npm run alias` waits for the Vercel build to finish, then re-points
`welcometothefuture.vercel.app` at it. A domain set with `vercel alias set`
sticks to one deployment, so it needs re-pointing after each push; override the
target with `ALIAS_DOMAIN=...`. The branch URL Vercel maintains
(`split-git-<branch>-<team>.vercel.app`) updates on its own and needs none of
this.

To run a single test file: `npx vitest run convex/calculations.test.ts`

## Architecture

**Split** is a real-time collaborative bill-splitting app. No authentication — 6-character alphanumeric session codes are the security boundary.

### Stack

- **Frontend**: React 19 + React Router 7 + TailwindCSS 4, built with Vite
- **Backend**: [Convex](https://convex.dev) — serverless real-time database with TypeScript functions
- **AI**: Anthropic SDK — Claude Vision API for receipt OCR via `convex/actions/parseReceipt.ts`

### Key Architectural Patterns

**Money is always integers (cents).** Never use floats for prices. The "largest remainder method" in `convex/calculations.ts` ensures tax/tip always sums exactly to the total.

**Convex real-time subscriptions.** Frontend components use `useQuery(api.*)` to subscribe to live data — no manual polling or WebSocket management. Mutations trigger automatic re-renders across all connected clients.

**Claims are a separate table.** Item splitting uses a many-to-many `claims` table (`itemId` + `participantId`) rather than arrays on items. This enables efficient per-session queries.

**Draft state pattern.** New items live in local React state until the user finishes editing, preventing incomplete items from broadcasting to other participants. Only one draft allowed at a time (in `src/pages/Session.tsx`).

**Participant verification without auth.** Each participant gets a UUID stored in `localStorage` (keyed by session code via `src/lib/sessionStorage.ts`). Mutations verify this ID against the DB. Host-only actions additionally check `isHost: true`.

**Every table has `sessionId`.** Denormalized for efficient session-scoped queries — all indexes include `sessionId`.

### Backend (`convex/`)

- `schema.ts` — Data model: `sessions`, `participants`, `items`, `claims`, `fees`
- `calculations.ts` — Pure tax/tip distribution logic (heavily tested)
- `sessions.ts` / `participants.ts` / `items.ts` / `claims.ts` / `fees.ts` — CRUD mutations and queries
- `actions/parseReceipt.ts` — Calls Claude Vision API with Structured Outputs, confidence threshold 0.7+
- `validation.ts` — Input bounds (names ≤100 chars, items ≤200 chars, money ≤$100k)

### Frontend (`src/`)

- `pages/Home.tsx` — Create/join sessions, local history via `lib/billHistory.ts`
- `pages/Session.tsx` — Main bill workspace; manages receipt processing state machine
- `components/Summary.tsx` — Per-person breakdown (subtotal + proportional tax/tip)
- `components/TaxTipSettings.tsx` — Configure tax/tip (percent of subtotal, percent of total, or fixed)

### Theming

Two themes ship: **Snack Pack** (light) and **Night Snack** (dark), swapped by
`components/ThemeToggle.tsx`. Never hardcode a colour in a component.

- All themed values are CSS custom properties in `src/index.css`, mapped into
  Tailwind utilities by `@theme inline` — that is what makes `bg-surface` /
  `text-ink` follow the theme instead of baking a colour in at build time.
- The resolved theme is always written to `<html data-theme>`: by the inline
  script in `index.html` before first paint, and by `lib/useTheme.ts` after,
  which also keeps the `theme-color` meta tags in sync. There is no
  `prefers-color-scheme` block in the CSS on purpose.
- The rule both themes follow: **an outline means you can press it, colour
  means whose it is.** Participants get a stable colour by join order via
  `lib/participantColors.ts`; the accent is reserved for actions, so nobody is
  ever the same colour as a button.
- `components/Mark.tsx` is the app mark. `<Mark>` holds down to 32px;
  `<MarkSmall>` is a separate drawing for 24px and under.

### Languages

Four ship: English, Spanish (Latin American), German and Thai, switched by
`components/LanguagePicker.tsx`. Never put a user-facing string in a component.

- `lib/i18n/en.ts` is the source of truth. `Messages` is derived from it
  (`typeof en`), so every other catalog is checked against it by tsc — a missing
  key, a stray key, or a plural where a plain string belongs fails
  `npm run build` rather than shipping a blank label.
- `useT()` gives you `t("some.key", { name })`. Use `useLocale().tNodes` when a
  placeholder is a React node (a bolded name) — do not splice markup around a
  translated fragment, because the placeholder does not sit in the same position
  in every language.
- Plurals are `{ one, other }` and are selected by `Intl.PluralRules`, never by
  `count === 1`. Thai has one grammatical number and always takes `other`.
- The resolved locale is written to `<html lang>`, by the inline script in
  `index.html` before first paint and by `LocaleProvider` after. First visit
  follows `navigator.languages`, matched on the primary subtag, so `es-MX` and
  `es-419` both get Spanish; an explicit choice is stored in `split_locale` and
  wins thereafter.
- **Money is deliberately not localized** — see `lib/money.ts`. Amounts are USD
  cents with no currency in the schema, and the receipt on the table is printed
  `$12.50`. Dates do follow the locale.
- Thai glyphs come from Noto Sans Thai, listed *after* the Latin faces in the
  font stacks so it only ever picks up Thai runs. Google Fonts splits it by
  `unicode-range`, so nobody reading the other three downloads it.

### Environment Variables

- `ANTHROPIC_API_KEY` — Required in `.env.local` for receipt OCR
- `VITE_CONVEX_URL` — Set automatically by `npx convex dev`

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.

<!-- convex-ai-end -->
