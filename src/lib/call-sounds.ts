type Tone = {
  freq: number;
  /** Optional glide target for a soft slide */
  freqEnd?: number;
  start: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  release?: number;
};

let sharedCtx: AudioContext | null = null;
let lastPlayAt = 0;
const MIN_GAP_MS = 70;

/** Keep SFX clearly audible over call audio */
const VOL = {
  serverEnter: 0.2,
  serverLeave: 0.18,
  join: 0.24,
  leave: 0.22,
  peer: 0.15,
  mute: 0.1,
  camera: 0.09,
  stream: 0.19,
  watcher: 0.14,
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
  {
    volume = 0.14,
    filterFreq,
  }: { volume?: number; filterFreq?: number } = {},
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
    master.gain.exponentialRampToValueAtTime(volume, now + 0.014);

    let chain: AudioNode = master;
    if (filterFreq) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(filterFreq, now);
      filter.Q.setValueAtTime(0.7, now);
      master.connect(filter);
      filter.connect(ctx.destination);
      chain = filter;
    } else {
      master.connect(ctx.destination);
    }

    let lastEnd = now;
    const nodes: AudioNode[] = [master];

    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const peak = tone.gain ?? 0.85;
      const attack = tone.attack ?? 0.018;
      const release = tone.release ?? Math.min(0.12, tone.dur * 0.45);
      const start = now + tone.start;
      const end = start + tone.dur;
      lastEnd = Math.max(lastEnd, end);
      osc.type = tone.type ?? "sine";
      osc.frequency.setValueAtTime(tone.freq, start);
      if (tone.freqEnd != null && tone.freqEnd > 0) {
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(40, tone.freqEnd),
          end,
        );
      }
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(
        peak,
        start + Math.min(attack, tone.dur * 0.35),
      );
      const fadeAt = Math.max(start + attack, end - release);
      gain.gain.setValueAtTime(peak, fadeAt);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain);
      gain.connect(master);
      nodes.push(osc, gain);
      osc.start(start);
      osc.stop(end + 0.04);
    }

    master.gain.setValueAtTime(volume, lastEnd);
    master.gain.exponentialRampToValueAtTime(0.0001, lastEnd + 0.08);

    const cleanupMs = Math.ceil((lastEnd - now + 0.25) * 1000);
    window.setTimeout(() => {
      try {
        master.disconnect();
        chain.disconnect();
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

/** Soft harp lift — entering a server from the picker */
export function playServerEnterSound() {
  playTones(
    [
      { freq: 349.23, start: 0, dur: 0.2, type: "sine", gain: 0.45, attack: 0.03 },
      { freq: 440.0, start: 0.07, dur: 0.22, type: "sine", gain: 0.5, attack: 0.03 },
      { freq: 523.25, start: 0.15, dur: 0.28, type: "triangle", gain: 0.42, attack: 0.04 },
      { freq: 698.46, start: 0.24, dur: 0.34, type: "sine", gain: 0.38, attack: 0.05, release: 0.18 },
    ],
    { volume: VOL.serverEnter, filterFreq: 4200 },
  );
}

/** Soft dusk settle — leaving back to server picker */
export function playServerLeaveSound() {
  playTones(
    [
      { freq: 659.25, start: 0, dur: 0.18, type: "sine", gain: 0.42, attack: 0.025 },
      { freq: 523.25, start: 0.1, dur: 0.22, type: "triangle", gain: 0.4, attack: 0.03 },
      { freq: 392.0, start: 0.2, dur: 0.32, type: "sine", gain: 0.36, attack: 0.04, release: 0.2 },
    ],
    { volume: VOL.serverLeave, filterFreq: 3200 },
  );
}

/** You joined a voice channel — glass sparkle, not the server harp */
export function playJoinSound() {
  playTones(
    [
      { freq: 987.77, start: 0, dur: 0.07, type: "sine", gain: 0.35, attack: 0.008 },
      { freq: 1318.51, start: 0.03, dur: 0.09, type: "sine", gain: 0.4, attack: 0.01 },
      { freq: 783.99, start: 0.1, dur: 0.2, type: "triangle", gain: 0.55, attack: 0.02, release: 0.12 },
      { freq: 1174.66, start: 0.14, dur: 0.16, type: "sine", gain: 0.28, attack: 0.015 },
    ],
    { volume: VOL.join, filterFreq: 5600 },
  );
}

/** You left a voice channel — warm low resolve */
export function playLeaveSound() {
  playTones(
    [
      { freq: 492.88, freqEnd: 369.99, start: 0, dur: 0.16, type: "sine", gain: 0.5, attack: 0.02 },
      { freq: 246.94, start: 0.08, dur: 0.28, type: "triangle", gain: 0.45, attack: 0.03, release: 0.16 },
    ],
    { volume: VOL.leave, filterFreq: 2800 },
  );
}

/** Another person joined the call — tiny bright tick */
export function playUserJoinedSound() {
  playTones(
    [
      { freq: 1480, start: 0, dur: 0.045, type: "sine", gain: 0.4, attack: 0.005 },
      { freq: 1760, start: 0.04, dur: 0.09, type: "triangle", gain: 0.48, attack: 0.008 },
    ],
    { volume: VOL.peer, filterFreq: 7000 },
  );
}

/** Another person left the call — soft wood drop */
export function playUserLeftSound() {
  playTones(
    [
      { freq: 415.3, freqEnd: 277.18, start: 0, dur: 0.12, type: "triangle", gain: 0.5, attack: 0.01 },
      { freq: 207.65, start: 0.06, dur: 0.14, type: "sine", gain: 0.35, attack: 0.015 },
    ],
    { volume: VOL.peer, filterFreq: 2400 },
  );
}

export function playMuteSound() {
  playTones(
    [{ freq: 268, freqEnd: 190, start: 0, dur: 0.08, type: "triangle", gain: 0.5, attack: 0.008 }],
    { volume: VOL.mute, filterFreq: 1800 },
  );
}

export function playUnmuteSound() {
  playTones(
    [
      { freq: 480, start: 0, dur: 0.05, type: "triangle", gain: 0.4, attack: 0.006 },
      { freq: 640, start: 0.04, dur: 0.08, type: "sine", gain: 0.45, attack: 0.01 },
    ],
    { volume: VOL.mute, filterFreq: 3600 },
  );
}

export function playCameraOffSound() {
  playTones(
    [{ freq: 240, freqEnd: 160, start: 0, dur: 0.09, type: "sine", gain: 0.45, attack: 0.01 }],
    { volume: VOL.camera, filterFreq: 1600 },
  );
}

export function playCameraOnSound() {
  playTones(
    [
      { freq: 560, start: 0, dur: 0.05, type: "sine", gain: 0.4, attack: 0.008 },
      { freq: 840, start: 0.045, dur: 0.09, type: "triangle", gain: 0.42, attack: 0.012 },
    ],
    { volume: VOL.camera, filterFreq: 4000 },
  );
}

/** Screen share opened — Lydian shimmer (bright, open) */
export function playStreamStartedSound() {
  playTones(
    [
      { freq: 392.0, start: 0, dur: 0.1, type: "sine", gain: 0.35, attack: 0.02 },
      { freq: 493.88, start: 0.06, dur: 0.11, type: "sine", gain: 0.4, attack: 0.02 },
      { freq: 587.33, start: 0.13, dur: 0.12, type: "triangle", gain: 0.45, attack: 0.02 },
      { freq: 739.99, start: 0.21, dur: 0.14, type: "sine", gain: 0.5, attack: 0.025 },
      { freq: 987.77, start: 0.3, dur: 0.22, type: "sine", gain: 0.38, attack: 0.03, release: 0.14 },
    ],
    { volume: VOL.stream, filterFreq: 6200 },
  );
}

/** Screen share closed — velvet curtain */
export function playStreamStoppedSound() {
  playTones(
    [
      { freq: 830.61, start: 0, dur: 0.1, type: "sine", gain: 0.42, attack: 0.02 },
      { freq: 622.25, start: 0.08, dur: 0.12, type: "triangle", gain: 0.4, attack: 0.025 },
      { freq: 415.3, start: 0.17, dur: 0.16, type: "sine", gain: 0.38, attack: 0.03 },
      { freq: 311.13, start: 0.26, dur: 0.24, type: "sine", gain: 0.32, attack: 0.04, release: 0.16 },
    ],
    { volume: VOL.stream * 0.95, filterFreq: 3600 },
  );
}

/** Someone started watching your stream */
export function playStreamWatcherJoinedSound() {
  playTones(
    [
      { freq: 622.25, start: 0, dur: 0.06, type: "triangle", gain: 0.42, attack: 0.008 },
      { freq: 932.33, start: 0.05, dur: 0.11, type: "sine", gain: 0.48, attack: 0.012 },
    ],
    { volume: VOL.watcher, filterFreq: 5200 },
  );
}

/** Someone stopped watching your stream */
export function playStreamWatcherLeftSound() {
  playTones(
    [
      { freq: 830.61, start: 0, dur: 0.07, type: "sine", gain: 0.4, attack: 0.01 },
      { freq: 466.16, start: 0.06, dur: 0.12, type: "triangle", gain: 0.42, attack: 0.015 },
    ],
    { volume: VOL.watcher, filterFreq: 3000 },
  );
}

/** Discord-like ping when someone else chats in the server */
export function playMessageNotification() {
  const nowMs = performance.now();
  if (nowMs - lastMessagePlayAt < 350) return;
  lastMessagePlayAt = nowMs;
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
    id: "stupid-leclarc",
    label: "Stupid",
    src: "/sounds/i-am-stupid-leclarc.mp3",
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
