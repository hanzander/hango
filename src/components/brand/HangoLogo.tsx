"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

type HangoLogoProps = {
  className?: string;
  /** Show wordmark next to the mark */
  withWordmark?: boolean;
  /** Mark size in px (wordmark scales with it) */
  size?: number;
  title?: string;
};

/** Crisp cozy mark — warm tile, cream bubble, amber ember. No nested frames. */
export function HangoMark({
  className,
  size = 28,
  title = "Hango",
}: Omit<HangoLogoProps, "withWordmark">) {
  const uid = useId().replace(/:/g, "");
  const tile = `tile-${uid}`;
  const bubble = `bubble-${uid}`;
  const glow = `glow-${uid}`;

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
      <defs>
        <linearGradient id={tile} x1="18" y1="4" x2="48" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3A2E26" />
          <stop offset="1" stopColor="#1A1512" />
        </linearGradient>
        <linearGradient id={bubble} x1="22" y1="16" x2="42" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F7F0E6" />
          <stop offset="1" stopColor="#E4D5C3" />
        </linearGradient>
        <radialGradient id={glow} cx="32" cy="48" r="16" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E0A86A" stopOpacity="0.45" />
          <stop offset="1" stopColor="#E0A86A" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${tile})`} />
      <circle cx="32" cy="46" r="15" fill={`url(#${glow})`} />
      <path
        d="M15 26c0-6.6 5.4-12 12-12h10c6.6 0 12 5.4 12 12v8c0 6.6-5.4 12-12 12H30.5l-7.8 5.8c-.9.7-2.2.05-2.2-1.1v-4.6C17.4 43.2 15 39.9 15 36v-10Z"
        fill={`url(#${bubble})`}
      />
      <circle cx="44" cy="20" r="5.5" fill="#F3E8D8" />
      <circle cx="32" cy="49" r="4" fill="#E0A86A" />
      <circle cx="32" cy="48" r="1.6" fill="#F6D7A8" opacity="0.9" />
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
          className="leading-none font-medium tracking-[-0.035em] text-[#EDE6DC]"
          style={{ fontSize: Math.round(size * 0.48) }}
        >
          hango
        </span>
      )}
    </span>
  );
}
