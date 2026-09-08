/** Dispatched to paint servers home immediately, then sync the URL. */
export const LEAVE_SERVER_EVENT = "hango:leave-server";

export function leaveServerNow(href = "/app") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(LEAVE_SERVER_EVENT, { detail: { href } }),
  );
}
