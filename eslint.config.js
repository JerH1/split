import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * Flat config for a React 19 + TypeScript + Vite app with a Convex backend.
 *
 * `npm run lint` has been in package.json since the project started but there
 * was never a config for it to find, so it has always exited with an error and
 * CI never ran it. This is that missing config.
 *
 * Prettier owns formatting, so nothing here has an opinion about layout.
 */
export default tseslint.config(
  {
    // Build output, dependencies, and code Convex generates and owns.
    ignores: ["dist", "node_modules", "convex/_generated", "playwright-report"],
  },

  // Browser code.
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],

      // The three rules below are new in eslint-plugin-react-hooks v6 and each
      // flags a long-standing, deliberate pattern here:
      //
      // - set-state-in-effect: components sync local edit state when an item
      //   changes underneath them. That is the point in a collaborative app -
      //   when someone else renames an item, your open editor should follow.
      // - purity: `useRef(Date.now())` marks mount time so join toasts only
      //   fire for people who arrive after you did.
      // - refs: TaxTipSettings reads a ref while rendering.
      //
      // Satisfying them means restructuring working real-time logic, which is
      // its own change with its own risk, not part of making lint run at all.
      // Left as warnings so the signal stays visible and can be paid down
      // deliberately rather than silently dropped.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      // A leading underscore is the established way in this codebase to mark a
      // binding that is deliberately unused (destructured-and-discarded props,
      // placeholder callback params).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Convex functions run on the server, not in a browser.
  {
    files: ["convex/**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Tests: same rules, plus the test globals vitest injects.
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "tests/**/*.ts", "e2e/**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node, ...globals.browser },
    },
  },

  // Config files at the repo root run in Node.
  {
    files: ["*.config.{js,ts}", "*.config.*.{js,ts}"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  },
);
