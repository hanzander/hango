/**
 * Session-stable media device list.
 * Never wipe a good list with an empty refresh (that caused the flash → "No devices").
 */

type Kind = MediaDeviceKind;

const cache: Partial<Record<Kind, MediaDeviceInfo[]>> = {};
const inflight = new Map<Kind, Promise<MediaDeviceInfo[]>>();

function cloneList(list: MediaDeviceInfo[]): MediaDeviceInfo[] {
  return list.slice();
}

export function getCachedDevices(kind: Kind): MediaDeviceInfo[] {
  return cloneList(cache[kind] ?? []);
}

function remember(kind: Kind, list: MediaDeviceInfo[]): MediaDeviceInfo[] {
  if (list.length > 0) {
    cache[kind] = list;
  }
  return getCachedDevices(kind);
}

async function enumerateKind(kind: Kind): Promise<MediaDeviceInfo[]> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === kind);
}

export type MicPermission = "granted" | "denied" | "prompt" | "unknown";

export async function queryMicPermission(): Promise<MicPermission> {
  try {
    if (!navigator.permissions?.query) return "unknown";
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    if (status.state === "granted" || status.state === "denied" || status.state === "prompt") {
      return status.state;
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

export type MicAccessResult =
  | { ok: true; devices: MediaDeviceInfo[] }
  | { ok: false; reason: "denied" | "notfound" | "busy" | "insecure" | "unknown"; message: string };

/**
 * Must run from a user gesture. Opens the browser mic prompt if needed,
 * then refreshes the device cache.
 */
export async function ensureMicAccess(): Promise<MicAccessResult> {
  if (typeof window === "undefined") {
    return { ok: false, reason: "unknown", message: "No window" };
  }
  if (!window.isSecureContext) {
    return {
      ok: false,
      reason: "insecure",
      message: "Microphone needs HTTPS. Open hango on https://…",
    };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      ok: false,
      reason: "unknown",
      message: "This browser can’t access the microphone.",
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch (err) {
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name: string }).name)
        : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      return {
        ok: false,
        reason: "denied",
        message:
          "Microphone is blocked. Click the lock/tune icon in the address bar → Site settings → Microphone → Allow, then try again.",
      };
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return {
        ok: false,
        reason: "notfound",
        message:
          "No microphone detected. Plug one in, check Windows privacy (Settings → Privacy → Microphone), then try again.",
      };
    }
    if (name === "NotReadableError" || name === "AbortError") {
      return {
        ok: false,
        reason: "busy",
        message:
          "Microphone is busy. Close Zoom/Teams/Discord/other browser tabs using it, then try again.",
      };
    }
    return {
      ok: false,
      reason: "unknown",
      message: err instanceof Error ? err.message : "Couldn’t access the microphone.",
    };
  }

  const devices = await refreshMediaDevices("audioinput");
  void refreshMediaDevices("audiooutput");
  return { ok: true, devices };
}

/**
 * Refresh devices for a kind. Empty results do not clear an existing cache.
 * Set requestPermission only when you are sure no LiveKit capture is using that device.
 */
export async function refreshMediaDevices(
  kind: Kind,
  opts: { requestPermission?: boolean } = {},
): Promise<MediaDeviceInfo[]> {
  const existing = inflight.get(kind);
  if (existing) return existing;

  const job = (async () => {
    try {
      let list = await enumerateKind(kind);

      if (
        opts.requestPermission &&
        !list.some((d) => d.label) &&
        (kind === "audioinput" || kind === "audiooutput" || kind === "videoinput")
      ) {
        try {
          const constraints: MediaStreamConstraints =
            kind === "videoinput" ? { video: true } : { audio: true };
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          stream.getTracks().forEach((t) => t.stop());
          list = await enumerateKind(kind);
        } catch {
          /* permission denied — keep whatever we have */
        }
      }

      return remember(kind, list);
    } finally {
      inflight.delete(kind);
    }
  })();

  inflight.set(kind, job);
  return job;
}

/** Warm cache after mic is up (no extra getUserMedia). */
export async function warmDeviceCache(): Promise<void> {
  await Promise.all([
    refreshMediaDevices("audioinput"),
    refreshMediaDevices("audiooutput"),
    refreshMediaDevices("videoinput"),
  ]);
}
