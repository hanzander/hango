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

/** Keep SFX clearly audible over call audio (+10%) */
const VOL = {
  join: 0.22 * 1.1,
  leave: 0.2 * 1.1,
  peer: 0.16 * 1.1,
  mute: 0.1 * 1.1,
  camera: 0.09 * 1.1,
  /** Chat pings — much louder so #general is hard to miss */
  message: 0.55,
  soundboard: 0.42,
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
      { freq: 740, start: 0, dur: 0.1, type: "sine", gain: 0.9 },
      { freq: 980, start: 0.08, dur: 0.18, type: "sine", gain: 1 },
      { freq: 1174, start: 0.16, dur: 0.14, type: "sine", gain: 0.75 },
    ],
    { volume: VOL.message },
  );
}

export type SoundboardClip = {
  id: string;
  label: string;
  tones?: Tone[];
  /** Public URL for an mp3/wav clip (e.g. /sounds/leclerc.mp3) */
  src?: string;
};

export const SOUNDBOARD_CLIPS: SoundboardClip[] = [
  {
    id: "leclerc",
    label: "Leclerc",
    src: "/sounds/leclerc.mp3",
  },
  {
    id: "horn",
    label: "Horn",
    tones: [
      { freq: 440, start: 0, dur: 0.35, type: "sawtooth", gain: 0.7 },
      { freq: 554, start: 0.05, dur: 0.35, type: "sawtooth", gain: 0.55 },
    ],
  },
  {
    id: "bruh",
    label: "Bruh",
    tones: [
      { freq: 180, start: 0, dur: 0.22, type: "triangle", gain: 0.85 },
      { freq: 140, start: 0.15, dur: 0.28, type: "triangle", gain: 0.7 },
    ],
  },
  {
    id: "cheer",
    label: "Cheer",
    tones: [
      { freq: 523, start: 0, dur: 0.1, gain: 0.7 },
      { freq: 659, start: 0.08, dur: 0.1, gain: 0.75 },
      { freq: 784, start: 0.16, dur: 0.18, gain: 0.8 },
    ],
  },
  {
    id: "quack",
    label: "Quack",
    tones: [
      { freq: 320, start: 0, dur: 0.08, type: "square", gain: 0.55 },
      { freq: 240, start: 0.07, dur: 0.12, type: "square", gain: 0.5 },
    ],
  },
  {
    id: "rimshot",
    label: "Ba-dum",
    tones: [
      { freq: 200, start: 0, dur: 0.06, type: "triangle", gain: 0.7 },
      { freq: 160, start: 0.08, dur: 0.06, type: "triangle", gain: 0.65 },
      { freq: 90, start: 0.2, dur: 0.25, type: "sine", gain: 0.9 },
    ],
  },
  {
    id: "zap",
    label: "Zap",
    tones: [
      { freq: 900, start: 0, dur: 0.05, type: "sawtooth", gain: 0.6 },
      { freq: 400, start: 0.04, dur: 0.1, type: "sawtooth", gain: 0.5 },
    ],
  },
];

function playAudioFile(src: string, volume = VOL.soundboard) {
  if (typeof window === "undefined") return;
  try {
    // One clip at a time — spam used to stack locally while remotes dropped packets
    if (activeSbAudio) {
      try {
        activeSbAudio.pause();
        activeSbAudio.src = "";
      } catch {
        /* ignore */
      }
      activeSbAudio = null;
    }
    const audio = new Audio(src);
    audio.volume = Math.min(1, Math.max(0, volume));
    activeSbAudio = audio;
    audio.addEventListener(
      "ended",
      () => {
        if (activeSbAudio === audio) activeSbAudio = null;
      },
      { once: true },
    );
    void audio.play().catch(() => {
      if (activeSbAudio === audio) activeSbAudio = null;
    });
  } catch {
    /* ignore */
  }
}

let activeSbAudio: HTMLAudioElement | null = null;
let lastSoundboardAt = 0;
/** Discord-like cooldown so spam stays in sync for everyone */
export const SOUNDBOARD_COOLDOWN_MS = 1250;

export function soundboardReady(): boolean {
  return performance.now() - lastSoundboardAt >= SOUNDBOARD_COOLDOWN_MS;
}

/**
 * Play a soundboard clip. Returns false if still on cooldown (unless force).
 * force = true for remote playback of a clip someone else already gated.
 */
export function playSoundboardClip(
  id: string,
  opts: { force?: boolean } = {},
): boolean {
  const clip = SOUNDBOARD_CLIPS.find((c) => c.id === id);
  if (!clip) return false;

  const now = performance.now();
  if (!opts.force && now - lastSoundboardAt < SOUNDBOARD_COOLDOWN_MS) {
    return false;
  }
  lastSoundboardAt = now;
  lastPlayAt = 0;

  if (clip.src) {
    playAudioFile(clip.src, VOL.soundboard);
    return true;
  }
  if (clip.tones?.length) {
    playTones(clip.tones, { volume: VOL.soundboard });
    return true;
  }
  return false;
}
