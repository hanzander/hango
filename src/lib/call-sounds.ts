type Tone = {
  freq: number;
  start: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
};

let sharedCtx: AudioContext | null = null;
let lastPlayAt = 0;
const MIN_GAP_MS = 80;

/** Keep SFX clearly audible over call audio */
const VOL = {
  join: 0.22,
  leave: 0.2,
  peer: 0.16,
  mute: 0.1,
  camera: 0.09,
  message: 0.2,
} as const;

let lastMessagePlayAt = 0;

function getSharedAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new AudioCtx();
  }
  return sharedCtx;
}

/** Call from a user gesture (Join, click) so SFX + call audio can play. */
export function unlockAudio() {
  try {
    const ctx = getSharedAudioContext();
    if (ctx?.state === "suspended") {
      void ctx.resume();
    }
  } catch {
    /* ignore */
  }
}

function playTones(
  tones: Tone[],
  { volume = 0.14 }: { volume?: number } = {},
) {
  try {
    const nowMs = performance.now();
    if (nowMs - lastPlayAt < MIN_GAP_MS) return;
    lastPlayAt = nowMs;

    const ctx = getSharedAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    master.connect(ctx.destination);

    let lastEnd = now;
    const nodes: AudioNode[] = [master];

    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const peak = tone.gain ?? 0.85;
      const start = now + tone.start;
      const end = start + tone.dur;
      lastEnd = Math.max(lastEnd, end);
      osc.type = tone.type ?? "sine";
      osc.frequency.setValueAtTime(tone.freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain);
      gain.connect(master);
      nodes.push(osc, gain);
      osc.start(start);
      osc.stop(end + 0.03);
    }

    master.gain.setValueAtTime(volume, lastEnd);
    master.gain.exponentialRampToValueAtTime(0.0001, lastEnd + 0.06);

    const cleanupMs = Math.ceil((lastEnd - now + 0.2) * 1000);
    window.setTimeout(() => {
      try {
        master.disconnect();
        for (const n of nodes) {
          try {
            n.disconnect();
          } catch {
            /* already stopped */
          }
        }
      } catch {
        /* ignore */
      }
    }, cleanupMs);
  } catch {
    // Ignore autoplay / AudioContext failures
  }
}

export function playJoinSound() {
  playTones(
    [
      { freq: 587.33, start: 0, dur: 0.14 },
      { freq: 783.99, start: 0.09, dur: 0.22 },
    ],
    { volume: VOL.join },
  );
}

export function playLeaveSound() {
  playTones(
    [
      { freq: 659.25, start: 0, dur: 0.12 },
      { freq: 493.88, start: 0.09, dur: 0.2 },
    ],
    { volume: VOL.leave },
  );
}

export function playUserJoinedSound() {
  playTones(
    [
      { freq: 880, start: 0, dur: 0.07, gain: 0.55 },
      { freq: 1174.66, start: 0.06, dur: 0.12, gain: 0.65 },
    ],
    { volume: VOL.peer },
  );
}

export function playUserLeftSound() {
  playTones(
    [
      { freq: 987.77, start: 0, dur: 0.07, gain: 0.55 },
      { freq: 659.25, start: 0.07, dur: 0.12, gain: 0.6 },
    ],
    { volume: VOL.peer },
  );
}

export function playMuteSound() {
  playTones(
    [{ freq: 320, start: 0, dur: 0.06, type: "triangle", gain: 0.55 }],
    { volume: VOL.mute },
  );
}

export function playUnmuteSound() {
  playTones(
    [{ freq: 520, start: 0, dur: 0.07, type: "triangle", gain: 0.55 }],
    { volume: VOL.mute },
  );
}

export function playCameraOffSound() {
  playTones(
    [{ freq: 280, start: 0, dur: 0.06, type: "sine", gain: 0.5 }],
    { volume: VOL.camera },
  );
}

export function playCameraOnSound() {
  playTones(
    [
      { freq: 440, start: 0, dur: 0.05, type: "sine", gain: 0.45 },
      { freq: 660, start: 0.04, dur: 0.07, type: "sine", gain: 0.5 },
    ],
    { volume: VOL.camera },
  );
}

/** Discord-like ping when someone else chats in the server */
export function playMessageNotification() {
  const nowMs = performance.now();
  if (nowMs - lastMessagePlayAt < 350) return;
  lastMessagePlayAt = nowMs;
  // Reset shared gap so a recent mute click doesn't eat the chat ping
  lastPlayAt = 0;
  playTones(
    [
      { freq: 740, start: 0, dur: 0.07, type: "sine", gain: 0.7 },
      { freq: 980, start: 0.06, dur: 0.12, type: "sine", gain: 0.8 },
    ],
    { volume: VOL.message },
  );
}
