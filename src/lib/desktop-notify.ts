"use client";

/** Browser Notification API helpers */

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

export function notifyDesktop(title: string, body: string, opts?: { tag?: string; onClick?: () => void }) {
  if (!notificationsSupported()) return;
  if (Notification.permission !== "granted") return;
  if (typeof document !== "undefined" && document.visibilityState === "visible") return;

  try {
    const n = new Notification(title, {
      body,
      tag: opts?.tag,
      silent: false,
    });
    n.onclick = () => {
      window.focus();
      opts?.onClick?.();
      n.close();
    };
  } catch {
    /* ignore */
  }
}
