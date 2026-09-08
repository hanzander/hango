/**
 * Voice UI preferences (sticky devices, NS, PTT, volumes).
 */

const NS_KEY = "hango-voice-ns";
const PTT_KEY = "hango-voice-ptt";
const VOLUMES_KEY = "hango-voice-peer-volumes";
const deviceKey = (kind: MediaDeviceKind) => `hango-device-${kind}`;

export function getNoiseSuppression(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(NS_KEY) === "1";
}

export function setNoiseSuppression(on: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(NS_KEY, on ? "1" : "0");
}

export function getPushToTalk(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(PTT_KEY) === "1";
}

export function setPushToTalk(on: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PTT_KEY, on ? "1" : "0");
}

export function getPeerVolumes(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(VOLUMES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function setPeerVolume(peerId: string, volume: number) {
  if (typeof window === "undefined" || !peerId) return;
  try {
    const next = { ...getPeerVolumes(), [peerId]: volume };
    localStorage.setItem(VOLUMES_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function getStickyDevice(kind: MediaDeviceKind): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(deviceKey(kind));
}

export function setStickyDevice(kind: MediaDeviceKind, deviceId: string) {
  if (typeof window === "undefined" || !deviceId) return;
  localStorage.setItem(deviceKey(kind), deviceId);
}

export function pickStickyDevice(
  kind: MediaDeviceKind,
  devices: MediaDeviceInfo[],
  current?: string | null,
): string | undefined {
  if (devices.length === 0) return undefined;
  const sticky = getStickyDevice(kind);
  if (sticky && devices.some((d) => d.deviceId === sticky)) return sticky;
  if (current && devices.some((d) => d.deviceId === current)) return current;
  return devices[0]?.deviceId;
}

export function micCaptureOpts(deviceId?: string): MediaTrackConstraints {
  const opts: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: getNoiseSuppression(),
    autoGainControl: true,
  };
  if (deviceId) opts.deviceId = { ideal: deviceId };
  return opts;
}
