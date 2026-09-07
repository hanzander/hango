"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { clearAuthCover } from "@/lib/auth-cover";

/** Drops the post-auth veil once the destination route has painted. */
export function AuthCoverClearer() {
  const pathname = usePathname();

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        clearAuthCover();
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [pathname]);

  return null;
}
