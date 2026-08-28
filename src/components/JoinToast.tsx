import { useEffect, useState } from "react";
import { useLocale } from "../lib/i18n/context";

interface JoinToastProps {
  name: string;
  onDismiss: () => void;
}

export default function JoinToast({ name, onDismiss }: JoinToastProps) {
  const { tNodes } = useLocale();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger animation on mount
    requestAnimationFrame(() => setIsVisible(true));

    // Auto-dismiss after 3 seconds
    const timer = setTimeout(() => {
      setIsVisible(false);
      // Wait for fade out animation before calling onDismiss
      setTimeout(onDismiss, 300);
    }, 3000);

    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="status"
      className={`fixed top-14 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
      }`}
    >
      <div className="rounded-full border-card border-line bg-surface px-4 py-2 text-sm text-ink shadow-hard-sm">
        {tNodes("join.toast", {
          name: <span className="font-bold">{name}</span>,
        })}
      </div>
    </div>
  );
}
