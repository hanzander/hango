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
 * Soft hangout mark — warm tile, cream bubble, amber ember.
 * Raster icon for favicon/rails; SVG preferred for crisp logo lockups.
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
      className={cn("shrink-0 rounded-[22%] shadow-[0_6px_18px_rgba(0,0,0,0.35)]", className)}
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
          className="leading-none font-semibold tracking-[-0.03em] text-[#E8DFD4]"
          style={{ fontSize: Math.round(size * 0.5) }}
        >
          hango
        </span>
      )}
    </span>
  );
}
