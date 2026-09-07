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
