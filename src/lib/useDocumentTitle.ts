import { useEffect } from "react";

const BASE_TITLE = "Split";

/**
 * Keeps <title> in sync with the current view. A single static title across
 * every route leaves screen reader and browser-history users with no way to
 * tell the views apart (WCAG 2.4.2 Page Titled).
 */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${BASE_TITLE}` : BASE_TITLE;
  }, [title]);
}
