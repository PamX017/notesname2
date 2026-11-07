export type MoodId = "calm" | "playful" | "dreamy";

export interface Mood {
  id: MoodId;
  label: string;
  /** MIDI note of the scale root */
  root: number;
  /** pentatonic scale, semitones above root */
  scale: number[];
  /** seconds per beat */
  beat: number;
  wave: OscillatorType;
  /** seconds a note rings */
  decay: number;
  /** low-pass cutoff (Hz) */
  cutoff: number;
  /** echo amount 0..1 */
  echo: number;
  /** possible note lengths in beats */
  lengths: number[];
}

export const MOODS: Record<MoodId, Mood> = {
  calm: {
    id: "calm",
    label: "Calm",
    root: 60,
    scale: [0, 2, 4, 7, 9],
    beat: 0.36,
    wave: "triangle",
    decay: 1.5,
    cutoff: 2600,
    echo: 0.22,
    lengths: [1, 1, 1, 2],
  },
  playful: {
    id: "playful",
    label: "Playful",
    root: 67,
    scale: [0, 2, 4, 7, 9],
    beat: 0.22,
    wave: "square",
    decay: 0.55,
    cutoff: 1800,
    echo: 0.12,
    lengths: [1, 1, 0.5, 1],
  },
  dreamy: {
    id: "dreamy",
    label: "Dreamy",
    root: 62,
    scale: [0, 2, 4, 6, 11],
    beat: 0.44,
    wave: "sine",
    decay: 2.4,
    cutoff: 3200,
    echo: 0.4,
    lengths: [1, 2, 1, 1],
  },
};

export const MOOD_IDS = Object.keys(MOODS) as MoodId[];

export function isMood(v: string | null | undefined): v is MoodId {
  return !!v && v in MOODS;
}

export interface NoteEvent {
  midi: number;
  /** staff position in half-steps, -4 (bottom line) … +4 (top line) */
  staff: number;
  /** start time in seconds from the beginning */
  time: number;
  /** length in seconds */
  dur: number;
  /** draw a flag on the stem */
  flag: boolean;
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The tune is a seeded random walk over a pentatonic scale, so any name sounds
 * pleasant, the same name always gives the same tune, and it resolves on the tonic.
 */
export function composeMelody(name: string, moodId: MoodId, count: number): NoteEvent[] {
  const mood = MOODS[moodId];
  const len = mood.scale.length;
  const top = len * 2 - 1; // two octaves of degrees: 0..top
  const rng = mulberry32(hash(`${name.toLowerCase()}|${moodId}`));
  const steps = [-3, -2, -1, -1, 1, 1, 2, 3];

  const firstCode = (name.toLowerCase().charCodeAt(0) || 97) - 97;
  let degree = len + (firstCode % len);
  if (degree > top) degree = top;

  const events: NoteEvent[] = [];
  let time = 0;

  for (let i = 0; i < count; i++) {
    if (i > 0) {
      let next = degree + steps[Math.floor(rng() * steps.length)];
      if (next < 0) next = -next;
      if (next > top) next = top - (next - top);
      degree = Math.max(0, Math.min(top, next));
    }
    // resolve on the tonic
    const d = i === count - 1 ? len : degree;
    const midi = mood.root + 12 * Math.floor(d / len) + mood.scale[d % len];
    const staff = Math.round((d / top) * 8 - 4);
    const beats = i === count - 1 ? 2 : mood.lengths[Math.floor(rng() * mood.lengths.length)];
    const dur = beats * mood.beat;
    events.push({ midi, staff, time, dur, flag: rng() < 0.45 });
    time += dur;
  }
  return events;
}
