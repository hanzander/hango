"use client";

import Image from "next/image";
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
 * Premium iOS-style hangout mark (speech bubbles + warm lamp).
 * Uses the polished raster icon so it reads like a real app icon.
 */
export function HangoMark({
  className,
  size = 28,
  title = "Hango",
}: Omit<HangoLogoProps, "withWordmark">) {
  return (
    <Image
      src="/brand/icon.png"
      alt={title}
      width={size}
      height={size}
      className={cn("shrink-0 rounded-[22%]", className)}
      priority
    />
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
      className={cn("inline-flex items-center gap-3", className)}
      title={title}
    >
      <HangoMark size={size} title={title} />
      {withWordmark && (
        <span
          className="leading-none font-semibold tracking-tight text-text"
          style={{ fontSize: Math.round(size * 0.52) }}
        >
          hango
        </span>
      )}
    </span>
  );
}
