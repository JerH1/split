import { useParams } from "react-router";
import QRCode from "react-qr-code";

export default function QrCode() {
  const { code } = useParams<{ code: string }>();
  const shareUrl = `${window.location.origin}/bill/${code}`;

  return (
    // dvh, not vh: on mobile Safari 100vh is taller than the visible viewport,
    // so a vh-centred block sits partly under the browser chrome and the fixed
    // tab bar. Padding rather than a magic min-height keeps it clear of both.
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-5 px-8 py-8">
      {/* The code is scanned off someone else's screen, so the quiet zone and
          the light ground stay regardless of theme — a dark QR on a dark
          ground does not read at all. */}
      <div className="rounded-card border-card border-line bg-white p-5 shadow-hard">
        <QRCode
          value={shareUrl}
          size={240}
          bgColor="#FFFFFF"
          fgColor="#221C12"
          title={`QR code for bill ${code}`}
        />
      </div>
      <p className="tabular font-display text-2xl font-extrabold tracking-[0.24em] indent-[0.24em] text-brand">
        {code}
      </p>
      <p className="max-w-xs text-center text-sm text-ink-2">
        Point a camera at this to open the bill.
      </p>
    </div>
  );
}
