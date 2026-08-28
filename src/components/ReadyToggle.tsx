import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

interface ReadyToggleProps {
  participantId: Id<"participants">;
  /** The current user's secret. The mutation will not act without it. */
  secret: string;
  isReady: boolean;
  disabled?: boolean;
}

/**
 * "I'm done claiming."
 *
 * The unclaimed-item count already says whether anything is left over, but not
 * whether anyone is still looking. Those are different problems: an untouched
 * side of fries might be nobody's, or it might belong to the person who hasn't
 * opened the bill yet, and only one of those is safe to divide up and move on.
 */
export default function ReadyToggle({
  participantId,
  secret,
  isReady,
  disabled = false,
}: ReadyToggleProps) {
  const setReady = useMutation(api.participants.setReady);

  return (
    <label
      className={`flex items-center gap-2 ${
        disabled ? "opacity-60" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        checked={isReady}
        disabled={disabled}
        onChange={(e) =>
          setReady({ participantId, secret, isReady: e.target.checked })
        }
        className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <span className="text-sm font-medium text-gray-800">
        I'm done claiming
      </span>
    </label>
  );
}
