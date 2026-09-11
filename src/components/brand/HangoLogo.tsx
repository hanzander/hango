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

/** Soft hangout mark — two speech bubbles + warm ember. */
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
      <rect width="64" height="64" rx="16" fill="#141312" />
      <path
        d="M18.5 22.5c0-3.6 2.9-6.5 6.5-6.5h10.2c3.6 0 6.5 2.9 6.5 6.5v8.2c0 3.6-2.9 6.5-6.5 6.5H28.4l-5.4 4.2c-.7.55-1.7.05-1.7-.85v-3.35c-1.7-.7-2.8-2.4-2.8-4.3v-10.4Z"
        fill="#EDE4D6"
      />
      <path
        d="M28.8 27.2c0-3.2 2.6-5.8 5.8-5.8H44c3.2 0 5.8 2.6 5.8 5.8v7.4c0 3.2-2.6 5.8-5.8 5.8h-5.6l-4.6 3.6c-.65.5-1.55.05-1.55-.8v-2.8c-1.5-.65-2.45-2.15-2.45-3.8v-9.4Z"
        fill="#F4EFE6"
      />
      <circle cx="32" cy="46.5" r="3.2" fill="#D4A574" />
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
