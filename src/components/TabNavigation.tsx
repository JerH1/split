import { NavLink } from "react-router";

type Tab = "items" | "taxtip" | "summary";

interface TabNavigationProps {
  unclaimedCount?: number;
}

// Simple icons as SVG components
function ListIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
    >
      <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  );
}

function CalculatorIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <path d="M9 7h6M9 11h.01M12 11h.01M15 11h.01M9 15h.01M12 15h.01M15 15v2" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16.5 5.5a3 3 0 0 1 0 5.6M18 20a6 6 0 0 0-2-4.5" />
    </svg>
  );
}

export default function TabNavigation({
  unclaimedCount = 0,
}: TabNavigationProps) {
  const tabs: { id: Tab; label: string; Icon: typeof ListIcon }[] = [
    { id: "items", label: "Items", Icon: ListIcon },
    { id: "taxtip", label: "Tax & Tip", Icon: CalculatorIcon },
    { id: "summary", label: "Totals", Icon: UsersIcon },
  ];

  return (
    <nav
      aria-label="Bill sections"
      className="fixed bottom-0 left-0 right-0 border-t-2 border-line bg-surface pb-safe"
    >
      <div className="mx-auto flex max-w-md">
        {tabs.map(({ id, label, Icon }, index) => {
          return (
            <NavLink
              to={id}
              key={id}
              className={({ isActive }) => {
                // The active tab is a filled panel rather than a tinted icon:
                // it is the one piece of chrome that has to read at a glance
                // while someone is holding a phone over a table.
                const base =
                  "flex-1 flex flex-col items-center justify-center gap-1 py-2.5 min-h-14 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus";
                const divider =
                  index < tabs.length - 1 ? " border-r-2 border-line" : "";
                return isActive
                  ? `${base}${divider} bg-accent text-accent-ink`
                  : `${base}${divider} text-ink-3`;
              }}
            >
              {({ isActive }) => (
                <>
                  {/* The badge is a visual duplicate of the count announced
                      below, so hide the whole graphic from assistive tech. */}
                  <div className="relative" aria-hidden="true">
                    <Icon className="w-6 h-6" />
                    {id === "items" && unclaimedCount > 0 && (
                      <span className="absolute -top-1.5 -right-2.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-line bg-alert px-1 text-[10px] font-bold text-alert-on">
                        {unclaimedCount}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-[11px] ${isActive ? "font-bold" : "font-semibold"}`}
                  >
                    {label}
                  </span>
                  {id === "items" && unclaimedCount > 0 && (
                    <span className="sr-only">
                      , {unclaimedCount} unclaimed{" "}
                      {unclaimedCount === 1 ? "item" : "items"}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
