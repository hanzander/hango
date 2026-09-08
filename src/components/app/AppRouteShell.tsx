"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppHome } from "@/components/app/AppHome";
import { ChatWorkspace } from "@/components/app/ChatWorkspace";
import { getAppBootstrapCache, setAppBootstrapCache } from "@/lib/app-cache";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/utils";
import type { Server } from "@/lib/types";
import { LEAVE_SERVER_EVENT } from "@/lib/leave-server";

type HomeState = {
  displayName: string;
  avatarUrl: string | null;
  userId: string;
  servers: Server[];
};

function homeFromCache(): HomeState | null {
  const cache = getAppBootstrapCache();
  if (!cache) return null;
  return {
    displayName: cache.profile.display_name ?? "User",
    avatarUrl: cache.profile.avatar_url,
    userId: cache.userId,
    servers: cache.servers,
  };
}

function parseAppPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  // ["app", ...]
  if (parts[0] !== "app") {
    return { kind: "other" as const };
  }
  const seg = parts[1];
  if (!seg) return { kind: "home" as const };
  if (seg === "demo" || seg === "friends" || seg === "dm") {
    return { kind: "passthrough" as const };
  }
  return {
    kind: "server" as const,
    serverId: seg,
    channelId: parts[2],
  };
}

/**
 * Keeps server UI / home under one client shell so “Leave server” can paint
 * the selection screen in the same frame — no waiting on RSC navigation.
 */
export function AppRouteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const parsed = parseAppPath(pathname);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (parsed.kind === "home") setLeaving(false);
  }, [parsed.kind]);

  useEffect(() => {
    function onLeave(event: Event) {
      const href =
        (event as CustomEvent<{ href?: string }>).detail?.href ?? "/app";
      // Paint home immediately; URL catch-up happens after.
      if (href === "/app" || href === "/app/") {
        setLeaving(true);
      }
      router.replace(href);
    }
    window.addEventListener(LEAVE_SERVER_EVENT, onLeave);
    return () => window.removeEventListener(LEAVE_SERVER_EVENT, onLeave);
  }, [router]);

  const showHome = leaving || parsed.kind === "home";
  const showWorkspace =
    !showHome &&
    parsed.kind === "server" &&
    Boolean(parsed.channelId);

  return (
    <>
      {showHome && <InstantServersHome active={showHome} />}
      {showWorkspace && parsed.kind === "server" && (
        <Suspense
          fallback={
            <div className="flex h-dvh items-center justify-center bg-bg text-sm text-text-muted">
              Loading Hango…
            </div>
          }
        >
          <ChatWorkspace
            serverId={parsed.serverId}
            channelId={parsed.channelId}
          />
        </Suspense>
      )}
      {/* demo / friends / dm / bare /app/[serverId] entry redirect */}
      {!showHome && !showWorkspace && children}
      {showWorkspace && (
        <div className="hidden" aria-hidden>
          {children}
        </div>
      )}
    </>
  );
}

function InstantServersHome({ active }: { active: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<HomeState | null>(() => homeFromCache());
  const [cold, setCold] = useState(() => !getAppBootstrapCache());

  useEffect(() => {
    if (!active) return;
    if (!isSupabaseConfigured()) {
      router.replace("/app/demo");
      return;
    }

    let cancelled = false;

    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        router.replace("/login");
        return;
      }

      const [profileResult, memberResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, avatar_url, onboarding_complete")
          .eq("id", user.id)
          .single(),
        supabase.from("server_members").select("server_id"),
      ]);

      if (cancelled) return;
      const profile = profileResult.data;
      if (!profile?.onboarding_complete) {
        router.replace("/onboarding");
        return;
      }

      const serverIds = (memberResult.data ?? []).map((m) => m.server_id);
      let servers: Server[] = [];
      if (serverIds.length) {
        const { data } = await supabase
          .from("servers")
          .select("*")
          .in("id", serverIds)
          .order("name");
        servers = (data as Server[]) ?? [];
      }

      if (cancelled) return;

      const next: HomeState = {
        displayName: profile.display_name ?? "User",
        avatarUrl: profile.avatar_url,
        userId: user.id,
        servers,
      };
      setState(next);
      setCold(false);

      const prev = getAppBootstrapCache();
      if (prev && prev.userId === user.id) {
        setAppBootstrapCache({
          ...prev,
          servers,
          profile: {
            ...prev.profile,
            display_name: next.displayName,
            avatar_url: next.avatarUrl,
          },
          savedAt: Date.now(),
        });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [active, router]);

  if (cold && !state) {
    return (
      <div className="flex h-dvh items-center justify-center bg-bg text-sm text-text-muted">
        Loading…
      </div>
    );
  }

  if (!state) return null;

  return (
    <AppHome
      displayName={state.displayName}
      avatarUrl={state.avatarUrl}
      userId={state.userId}
      servers={state.servers}
    />
  );
}
