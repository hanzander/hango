/**
 * Session-stable media device list + robust mic permission for other users' PCs.
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
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices?.enumerateDevices
  ) {
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
    if (
      status.state === "granted" ||
      status.state === "denied" ||
      status.state === "prompt"
    ) {
      return status.state;
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

export type MicAccessResult =
  | { ok: true; devices: MediaDeviceInfo[]; deviceId?: string }
  | {
      ok: false;
      reason: "denied" | "notfound" | "busy" | "insecure" | "unknown";
      message: string;
      steps: string[];
    };

const DENIED_STEPS = [
  "Click the lock (or tune) icon left of the URL in the address bar",
  "Set Microphone to Allow",
  "Reload the page, rejoin Lounge, then click Allow microphone again",
];

const NOTFOUND_STEPS = [
  "Windows: Settings → Privacy & security → Microphone → turn on for apps and your browser (Chrome/Edge)",
  "Unplug/replug the mic, or set it as default in Windows Sound settings",
  "Close Zoom, Teams, Discord, and other tabs that might be using the mic",
  "Reload Hango and click Allow microphone again",
];

const AUDIO_CONSTRAINTS: MediaStreamConstraints[] = [
  { audio: true },
  { audio: { deviceId: "default" } },
  {
    audio: {
      echoCancellation: true,
      noiseSuppression: false,
      autoGainControl: true,
    },
  },
  {
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  },
];

async function tryGetUserMediaAudio(): Promise<MediaStream> {
  let lastErr: unknown;
  for (const constraints of AUDIO_CONSTRAINTS) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastErr = err;
      const name =
        err && typeof err === "object" && "name" in err
          ? String((err as { name: string }).name)
          : "";
      // Permission hard-deny — no point retrying other constraints
      if (name === "NotAllowedError" || name === "SecurityError") throw err;
    }
  }
  throw lastErr;
}

/**
 * Must run from a user gesture. Opens the browser mic prompt if needed,
 * then refreshes the device cache.
 */
export async function ensureMicAccess(): Promise<MicAccessResult> {
  if (typeof window === "undefined") {
    return {
      ok: false,
      reason: "unknown",
      message: "No window",
      steps: [],
    };
  }
  if (!window.isSecureContext) {
    return {
      ok: false,
      reason: "insecure",
      message: "Microphone needs HTTPS. Open hango on https://…",
      steps: ["Open the site using https://hango-red.vercel.app (not http)"],
    };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      ok: false,
      reason: "unknown",
      message: "This browser can’t access the microphone.",
      steps: ["Use the latest Chrome or Edge on desktop"],
    };
  }

  const perm = await queryMicPermission();
  if (perm === "denied") {
    return {
      ok: false,
      reason: "denied",
      message:
        "This browser blocked the mic for Hango. You must Allow it in site settings — the popup won’t appear until you do.",
      steps: DENIED_STEPS,
    };
  }

  try {
    const stream = await tryGetUserMediaAudio();
    const track = stream.getAudioTracks()[0];
    const deviceId = track?.getSettings?.().deviceId;
    // Brief pause so Windows releases exclusive mode before LiveKit re-opens
    stream.getTracks().forEach((t) => t.stop());
    await new Promise((r) => setTimeout(r, 120));

    const devices = await refreshMediaDevices("audioinput");
    void refreshMediaDevices("audiooutput");
    return { ok: true, devices, deviceId };
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
          "Microphone permission was denied. Allow it in the address bar, then try again.",
        steps: DENIED_STEPS,
      };
    }

    if (name === "NotReadableError" || name === "AbortError") {
      return {
        ok: false,
        reason: "busy",
        message:
          "Microphone is busy in another app. Close Zoom/Teams/Discord/other browser tabs, then try again.",
        steps: [
          "Fully quit Zoom, Teams, Discord, and OBS if open",
          "Close other browser tabs that might be using the mic",
          "Click Allow microphone again",
        ],
      };
    }

    // NotFound often means OS privacy block, not "no hardware"
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      const listed = await enumerateKind("audioinput");
      if (listed.length > 0 || perm === "prompt") {
        return {
          ok: false,
          reason: "notfound",
          message:
            "The browser can’t open your mic (often Windows privacy or a blocked site permission). Follow the steps below.",
          steps: [...DENIED_STEPS.slice(0, 2), ...NOTFOUND_STEPS],
        };
      }
      return {
        ok: false,
        reason: "notfound",
        message:
          "No microphone detected. Plug one in and allow it in Windows privacy, then try again.",
        steps: NOTFOUND_STEPS,
      };
    }

    return {
      ok: false,
      reason: "unknown",
      message:
        err instanceof Error ? err.message : "Couldn’t access the microphone.",
      steps: DENIED_STEPS,
    };
  }
}

/**
 * Refresh devices for a kind. Empty results do not clear an existing cache.
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
        (kind === "audioinput" ||
          kind === "audiooutput" ||
          kind === "videoinput")
      ) {
        try {
          if (kind === "videoinput") {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: true,
            });
            stream.getTracks().forEach((t) => t.stop());
          } else {
            const stream = await tryGetUserMediaAudio();
            stream.getTracks().forEach((t) => t.stop());
          }
          list = await enumerateKind(kind);
        } catch {
          /* keep whatever we have */
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

export async function warmDeviceCache(): Promise<void> {
  await Promise.all([
    refreshMediaDevices("audioinput"),
    refreshMediaDevices("audiooutput"),
    refreshMediaDevices("videoinput"),
  ]);
}
