type Tone = {
  freq: number;
  start: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
};

let sharedCtx: AudioContext | null = null;

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
  if (sharedCtx.state === "suspended") {
    void sharedCtx.resume();
  }
  return sharedCtx;
}

function playTones(
  tones: Tone[],
  { volume = 0.14 }: { volume?: number } = {},
) {
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    master.connect(ctx.destination);

    let lastEnd = now;
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
      osc.start(start);
      osc.stop(end + 0.03);
    }

    master.gain.setValueAtTime(volume, lastEnd);
    master.gain.exponentialRampToValueAtTime(0.0001, lastEnd + 0.06);
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
    { volume: 0.14 },
  );
}

export function playLeaveSound() {
  playTones(
    [
      { freq: 659.25, start: 0, dur: 0.12 },
      { freq: 493.88, start: 0.09, dur: 0.2 },
    ],
    { volume: 0.12 },
  );
}

export function playUserJoinedSound() {
  playTones(
    [
      { freq: 880, start: 0, dur: 0.08, gain: 0.65 },
      { freq: 1174.66, start: 0.07, dur: 0.14, gain: 0.75 },
    ],
    { volume: 0.1 },
  );
}

export function playUserLeftSound() {
  playTones(
    [
      { freq: 987.77, start: 0, dur: 0.08, gain: 0.65 },
      { freq: 659.25, start: 0.08, dur: 0.15, gain: 0.7 },
    ],
    { volume: 0.09 },
  );
}

export function playMuteSound() {
  playTones(
    [{ freq: 320, start: 0, dur: 0.06, type: "triangle", gain: 0.55 }],
    { volume: 0.06 },
  );
}

export function playUnmuteSound() {
  playTones(
    [{ freq: 520, start: 0, dur: 0.07, type: "triangle", gain: 0.55 }],
    { volume: 0.06 },
  );
}

export function playCameraOffSound() {
  playTones(
    [{ freq: 280, start: 0, dur: 0.06, type: "sine", gain: 0.5 }],
    { volume: 0.05 },
  );
}

export function playCameraOnSound() {
  playTones(
    [
      { freq: 440, start: 0, dur: 0.05, type: "sine", gain: 0.45 },
      { freq: 660, start: 0.04, dur: 0.07, type: "sine", gain: 0.5 },
    ],
    { volume: 0.05 },
  );
}
