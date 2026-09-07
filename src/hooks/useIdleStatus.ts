"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { UserStatus } from "@/lib/types";

const IDLE_MS = 5 * 60 * 1000;

/** Auto-set profile status to idle after AFK; restore online on activity */
export function useIdleStatus(opts: {
  userId: string;
  enabled?: boolean;
  status?: UserStatus;
  onStatus?: (s: UserStatus) => void;
}) {
  const { userId, enabled = true, status = "online", onStatus } = opts;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idle = useRef(false);

  useEffect(() => {
    if (!enabled || !userId) return;
    if (status === "dnd" || status === "invisible") return;

    async function setStatus(next: UserStatus) {
      const supabase = createClient();
      await supabase.from("profiles").update({ status: next }).eq("id", userId);
      onStatus?.(next);
    }

    function goIdle() {
      if (idle.current) return;
      idle.current = true;
      void setStatus("idle");
    }

    function bump() {
      if (timer.current) clearTimeout(timer.current);
      if (idle.current) {
        idle.current = false;
        void setStatus("online");
      }
      timer.current = setTimeout(goIdle, IDLE_MS);
    }

    const events = ["mousemove", "keydown", "pointerdown", "scroll"] as const;
    events.forEach((ev) => window.addEventListener(ev, bump, { passive: true }));
    bump();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      events.forEach((ev) => window.removeEventListener(ev, bump));
    };
  }, [enabled, userId, status, onStatus]);
}
