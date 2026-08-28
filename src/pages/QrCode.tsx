import { useParams } from "react-router";
import QRCode from "react-qr-code";

export default function QrCode() {
  const { code } = useParams<{ code: string }>();
  const shareUrl = `${window.location.origin}/bill/${code}`;

  return (
    <div className="flex min-h-[calc(100vh-120px)] flex-col items-center justify-center gap-5 px-8 pb-24">
      {/* The code is scanned off someone else's screen, so the quiet zone and
          the light ground stay regardless of theme — a dark QR on a dark
          ground does not read. */}
      <div className="rounded-card border-card border-line bg-white p-5 shadow-hard">
        <QRCode
          value={shareUrl}
          size={240}
          bgColor="#FFFFFF"
          fgColor="#221C12"
        />
      </div>
      <p className="tabular font-display text-2xl font-extrabold tracking-[0.24em] indent-[0.24em] text-brand">
        {code}
      </p>
    </div>
  );
}
