type Tone = {
  freq: number;
  start: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
};

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;
  return new AudioCtx();
}

function playTones(
  tones: Tone[],
  {
    volume = 0.16,
    release = 0.08,
  }: { volume?: number; release?: number } = {},
) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const end =
      now +
      Math.max(...tones.map((t) => t.start + t.dur), 0.2) +
      release +
      0.05;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(volume, now + 0.015);
    master.gain.setValueAtTime(volume, end - release - 0.05);
    master.gain.exponentialRampToValueAtTime(0.0001, end);
    master.connect(ctx.destination);

    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const peak = tone.gain ?? 0.9;
      osc.type = tone.type ?? "sine";
      osc.frequency.setValueAtTime(tone.freq, now + tone.start);
      gain.gain.setValueAtTime(0.0001, now + tone.start);
      gain.gain.exponentialRampToValueAtTime(peak, now + tone.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + tone.start + tone.dur,
      );
      osc.connect(gain);
      gain.connect(master);
      osc.start(now + tone.start);
      osc.stop(now + tone.start + tone.dur + 0.04);
    }

    window.setTimeout(() => {
      void ctx.close();
    }, (end - now) * 1000 + 80);
  } catch {
    // Ignore autoplay / AudioContext failures
  }
}

/** You joined the call — bright ascending chime */
export function playJoinSound() {
  playTones(
    [
      { freq: 587.33, start: 0, dur: 0.16 }, // D5
      { freq: 783.99, start: 0.1, dur: 0.28 }, // G5
    ],
    { volume: 0.17 },
  );
}

/** You left / disconnected — soft descending chime */
export function playLeaveSound() {
  playTones(
    [
      { freq: 659.25, start: 0, dur: 0.14 }, // E5
      { freq: 493.88, start: 0.1, dur: 0.26 }, // B4
    ],
    { volume: 0.15 },
  );
}

/** Someone else joined the voice channel */
export function playUserJoinedSound() {
  playTones(
    [
      { freq: 880, start: 0, dur: 0.1, gain: 0.7 }, // A5
      { freq: 1174.66, start: 0.08, dur: 0.18, gain: 0.85 }, // D6
    ],
    { volume: 0.12 },
  );
}

/** Someone else left the voice channel */
export function playUserLeftSound() {
  playTones(
    [
      { freq: 987.77, start: 0, dur: 0.1, gain: 0.7 }, // B5
      { freq: 659.25, start: 0.09, dur: 0.2, gain: 0.8 }, // E5
    ],
    { volume: 0.11 },
  );
}

/** Mic muted */
export function playMuteSound() {
  playTones(
    [{ freq: 320, start: 0, dur: 0.08, type: "triangle", gain: 0.6 }],
    { volume: 0.08 },
  );
}

/** Mic unmuted */
export function playUnmuteSound() {
  playTones(
    [{ freq: 520, start: 0, dur: 0.09, type: "triangle", gain: 0.65 }],
    { volume: 0.08 },
  );
}

/** Camera turned off */
export function playCameraOffSound() {
  playTones(
    [{ freq: 280, start: 0, dur: 0.07, type: "sine", gain: 0.55 }],
    { volume: 0.07 },
  );
}

/** Camera turned on */
export function playCameraOnSound() {
  playTones(
    [
      { freq: 440, start: 0, dur: 0.06, type: "sine", gain: 0.5 },
      { freq: 660, start: 0.05, dur: 0.08, type: "sine", gain: 0.55 },
    ],
    { volume: 0.07 },
  );
}
