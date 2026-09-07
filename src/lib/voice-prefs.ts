/**
 * Voice UI preferences (sticky devices + noise suppression).
 */

const NS_KEY = "hango-voice-ns";
const deviceKey = (kind: MediaDeviceKind) => `hango-device-${kind}`;

export function getNoiseSuppression(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(NS_KEY) === "1";
}

export function setNoiseSuppression(on: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(NS_KEY, on ? "1" : "0");
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
