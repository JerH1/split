import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router";
import ConnectionStatus from "./ConnectionStatus";
import { useT } from "../lib/i18n/context";

export default function Layout() {
  const t = useT();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const isFirstRender = useRef(true);

  // Move focus to the main region on route change. Without this a SPA
  // navigation leaves focus wherever it was (usually the tab that was just
  // activated), so screen reader users get no signal that the view changed.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    mainRef.current?.focus();
  }, [pathname]);

  return (
    <div className="min-h-screen bg-page">
      {/* Connection status indicator - shows when disconnected */}
      <ConnectionStatus />

      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-tile focus:border-card focus:border-line focus:bg-surface focus:px-4 focus:py-2 focus:font-bold focus:text-ink focus:shadow-hard"
      >
        {t("a11y.skipToContent")}
      </a>

      {/* Mobile-first container - max width for tablet/desktop */}
      <div className="mx-auto min-h-screen max-w-md bg-page sm:border-x sm:border-line-soft">
        {/* Main content area */}
        <main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          className="pb-safe focus:outline-none"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
