/**
 * PayPerPhase wordmark: a tile with three ascending phase bars and a payment diamond,
 * then the name. Pure SVG + text: no third-party logos, safe on server and client.
 */
import { cx } from "@/lib/ui/cx";

export function WordmarkMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className={cx("shrink-0", className)}
    >
      <defs>
        <linearGradient id="ppp-mark-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14a095" />
          <stop offset="1" stopColor="#0b5d57" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#ppp-mark-g)" />
      <rect x="12" y="38" width="10" height="14" rx="3" fill="#fff" opacity=".55" />
      <rect x="27" y="28" width="10" height="24" rx="3" fill="#fff" opacity=".78" />
      <rect x="42" y="16" width="10" height="36" rx="3" fill="#fff" />
      <path d="M47 8l4.2 4.2L47 16.4l-4.2-4.2z" fill="#fff" />
    </svg>
  );
}

export function Wordmark({
  size = 32,
  tone = "dark",
  className,
}: {
  size?: number;
  /** "dark" = ink text on light surfaces; "light" = white text on dark surfaces (cards). */
  tone?: "dark" | "light";
  className?: string;
}) {
  return (
    <span data-testid="wordmark" className={cx("inline-flex items-center gap-3", className)}>
      <WordmarkMark size={size} />
      <span
        className={cx("font-semibold tracking-tight", tone === "light" ? "text-white" : "text-ink")}
        style={{ fontSize: size * 0.62 }}
      >
        Pay<span className={tone === "light" ? "text-teal-300" : "text-primary"}>Per</span>Phase
      </span>
    </span>
  );
}
