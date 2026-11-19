"use client";

/**
 * Tiny synthesized sound kit for Table Mode. Everything is generated with the
 * Web Audio API, so there are no audio assets to ship and nothing plays until
 * the user has interacted with the page (browsers require a gesture anyway).
 */

const MUTE_KEY = "tabletopforge.soundMuted";

let context: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readMuted();

function readMuted() {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(MUTE_KEY) === "true";
  } catch {
    return false;
  }
}

export function isSoundMuted() {
  return muted;
}

export function setSoundMuted(next: boolean) {
  muted = next;
  try {
    window.localStorage.setItem(MUTE_KEY, String(next));
  } catch {
    // Storage can be unavailable (private mode); the toggle still works for this visit.
  }
}

function getContext() {
  if (muted || typeof window === "undefined") {
    return null;
  }

  if (!context) {
    const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) {
      return null;
    }
    context = new AudioCtor();
    master = context.createGain();
    master.gain.value = 0.55;
    master.connect(context.destination);
  }

  if (context.state === "suspended") {
    void context.resume();
  }

  return context;
}

function tone({
  frequency,
  endFrequency,
  duration,
  type = "sine",
  volume = 0.2,
  delay = 0,
}: {
  frequency: number;
  endFrequency?: number;
  duration: number;
  type?: OscillatorType;
  volume?: number;
  delay?: number;
}) {
  const ctx = getContext();
  if (!ctx || !master) {
    return;
  }

  const start = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  }
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(master);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function noise({ duration, volume = 0.2, filter = 1800, delay = 0 }: { duration: number; volume?: number; filter?: number; delay?: number }) {
  const ctx = getContext();
  if (!ctx || !master) {
    return;
  }

  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / length, 3);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = filter;
  band.Q.value = 1.4;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(band).connect(gain).connect(master);
  source.start(ctx.currentTime + delay);
}

export const gameSounds = {
  /** A die hitting the tray. Strength is roughly the impact velocity. */
  diceHit(strength: number) {
    const level = Math.min(1, strength / 6);
    if (level < 0.08) {
      return;
    }
    noise({ duration: 0.05 + level * 0.04, volume: 0.08 + level * 0.32, filter: 2400 + Math.random() * 1600 });
    tone({ frequency: 900 + Math.random() * 500, duration: 0.05, type: "triangle", volume: 0.03 + level * 0.06 });
  },
  shake() {
    for (let index = 0; index < 5; index += 1) {
      noise({ duration: 0.04, volume: 0.07, filter: 3200, delay: index * 0.045 });
    }
  },
  hop(step: number) {
    tone({ frequency: 520 + step * 45, endFrequency: 760 + step * 45, duration: 0.09, type: "triangle", volume: 0.07 });
  },
  land() {
    tone({ frequency: 220, endFrequency: 110, duration: 0.16, type: "sine", volume: 0.22 });
    noise({ duration: 0.06, volume: 0.06, filter: 900 });
  },
  card() {
    noise({ duration: 0.18, volume: 0.12, filter: 5200 });
    tone({ frequency: 660, endFrequency: 990, duration: 0.14, type: "sine", volume: 0.05, delay: 0.05 });
  },
  twist() {
    tone({ frequency: 196, endFrequency: 98, duration: 0.6, type: "sawtooth", volume: 0.06 });
    tone({ frequency: 233, endFrequency: 116, duration: 0.6, type: "square", volume: 0.03, delay: 0.04 });
    noise({ duration: 0.4, volume: 0.08, filter: 400 });
  },
  points() {
    [784, 988, 1319].forEach((frequency, index) => tone({ frequency, duration: 0.14, type: "triangle", volume: 0.07, delay: index * 0.07 }));
  },
  lap() {
    [523, 659, 784, 1047].forEach((frequency, index) => tone({ frequency, duration: 0.22, type: "triangle", volume: 0.08, delay: index * 0.09 }));
  },
  victory() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((frequency, index) =>
      tone({ frequency, duration: 0.3, type: "triangle", volume: 0.08, delay: index * 0.12 }),
    );
  },
  lose() {
    tone({ frequency: 392, endFrequency: 196, duration: 0.32, type: "square", volume: 0.05 });
    tone({ frequency: 330, endFrequency: 165, duration: 0.32, type: "triangle", volume: 0.05, delay: 0.08 });
  },
  click() {
    tone({ frequency: 1200, duration: 0.03, type: "square", volume: 0.025 });
  },
};
