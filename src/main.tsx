import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import App from "./App";
import LocaleProvider from "./lib/i18n/LocaleProvider";
import { applyLocale, resolveLocale } from "./lib/i18n/locales";
import "./index.css";

// Settle <html lang> before the first render, the same way index.html does it
// for the theme. Doing it only inside the provider would leave the very first
// paint claiming a language the page is not written in.
applyLocale(resolveLocale());

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <LocaleProvider>
        <App />
      </LocaleProvider>
    </ConvexProvider>
  </StrictMode>,
);
