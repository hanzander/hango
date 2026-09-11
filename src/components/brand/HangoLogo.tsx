"use client";

import { cn } from "@/lib/utils";

type HangoLogoProps = {
  className?: string;
  /** Show wordmark next to the mark */
  withWordmark?: boolean;
  /** Mark size in px (wordmark scales with it) */
  size?: number;
  title?: string;
};

/**
 * Crisp hangout mark: rounded tile + clear geometric “h” + warm ember.
 * Designed to stay readable at favicon / rail sizes.
 */
export function HangoMark({
  className,
  size = 28,
  title = "Hango",
}: Omit<HangoLogoProps, "withWordmark">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      role="img"
      aria-label={title}
    >
      <rect width="64" height="64" rx="15" fill="#1C1917" />
      <rect
        x="1.25"
        y="1.25"
        width="61.5"
        height="61.5"
        rx="13.75"
        stroke="#3A3530"
        strokeWidth="2.5"
      />
      {/* Geometric rounded h */}
      <path
        d="M20 16.5c0-1.4 1.1-2.5 2.5-2.5s2.5 1.1 2.5 2.5v11.2c1.35-1.55 3.35-2.45 5.55-2.45 5.1 0 9.05 3.95 9.05 9.05V47.5c0 1.4-1.1 2.5-2.5 2.5s-2.5-1.1-2.5-2.5V36.8c0-2.55-2.05-4.6-4.55-4.6-2.5 0-4.55 2.05-4.55 4.6V47.5c0 1.4-1.1 2.5-2.5 2.5s-2.5-1.1-2.5-2.5V16.5Z"
        fill="#F5F0E8"
      />
      <circle cx="42.5" cy="24" r="3.4" fill="#E0A86A" />
    </svg>
  );
}

export function HangoLogo({
  className,
  withWordmark = true,
  size = 28,
  title = "Hango",
}: HangoLogoProps) {
  return (
    <span
      className={cn("inline-flex items-center gap-2.5", className)}
      title={title}
    >
      <HangoMark size={size} title={title} />
      {withWordmark && (
        <span
          className="font-semibold tracking-tight text-text"
          style={{ fontSize: Math.round(size * 0.72) }}
        >
          hango
        </span>
      )}
    </span>
  );
}
