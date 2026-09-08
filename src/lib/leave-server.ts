import { getServerEnterHref } from "@/lib/app-cache";

/** Paint servers home immediately, then sync the URL. */
export const LEAVE_SERVER_EVENT = "hango:leave-server";

/** Paint a server workspace immediately, then sync the URL. */
export const ENTER_SERVER_EVENT = "hango:enter-server";

export function leaveServerNow(href = "/app") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(LEAVE_SERVER_EVENT, { detail: { href } }),
  );
}

/** Accept a full href or a server id; resolves last channel when needed. */
export function enterServerNow(serverIdOrHref: string) {
  if (typeof window === "undefined") return;
  let href = serverIdOrHref;
  if (!href.startsWith("/")) {
    href = getServerEnterHref(href);
  } else {
    const parts = href.split("/").filter(Boolean);
    // /app/:serverId  → prefer cached channel
    if (parts[0] === "app" && parts[1] && !parts[2]) {
      href = getServerEnterHref(parts[1]);
    }
  }
  window.dispatchEvent(
    new CustomEvent(ENTER_SERVER_EVENT, { detail: { href } }),
  );
}

export function parseServerHref(
  href: string,
): { serverId: string; channelId?: string } | null {
  const parts = href.split("/").filter(Boolean);
  if (parts[0] !== "app" || !parts[1]) return null;
  if (parts[1] === "demo" || parts[1] === "friends" || parts[1] === "dm") {
    return null;
  }
  return { serverId: parts[1], channelId: parts[2] };
}
