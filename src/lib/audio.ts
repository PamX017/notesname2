import { MOODS, type MoodId, type NoteEvent } from "./melody";

type AudioCtor = typeof AudioContext;

const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Plays a list of note events with Web Audio (no audio files, no dependencies). */
export class NotePlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private events: NoteEvent[] = [];
  private startAt = 0;
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private onEnd: (() => void) | null = null;
  private live: Set<{ osc: OscillatorNode[]; gain: GainNode }> = new Set();
  playing = false;

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor: AudioCtor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  start(events: NoteEvent[], moodId: MoodId, onEnd: () => void): boolean {
    this.stop(false);
    const ctx = this.ensureContext();
    if (!ctx || !this.master || events.length === 0) return false;
    void ctx.resume();

    const mood = MOODS[moodId];
    this.events = events;
    this.onEnd = onEnd;
    this.playing = true;
    this.startAt = ctx.currentTime + 0.08;

    // shared echo bus
    const delay = ctx.createDelay(1);
    delay.delayTime.value = mood.beat * 0.75;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.35;
    const wet = ctx.createGain();
    wet.gain.value = mood.echo;
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(this.master);

    for (const ev of events) {
      const t = this.startAt + ev.time;
      const hz = midiToHz(ev.midi);
      const osc = ctx.createOscillator();
      osc.type = mood.wave;
      osc.frequency.value = hz;
      const shimmer = ctx.createOscillator();
      shimmer.type = "sine";
      shimmer.frequency.value = hz * 2;
      const shimmerGain = ctx.createGain();
      shimmerGain.gain.value = 0.14;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = mood.cutoff;

      const gain = ctx.createGain();
      const peak = mood.wave === "square" ? 0.16 : 0.3;
      const ring = Math.min(mood.decay, ev.dur + 0.9);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(peak, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + ring);

      osc.connect(filter);
      shimmer.connect(shimmerGain);
      shimmerGain.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      gain.connect(delay);

      osc.start(t);
      shimmer.start(t);
      osc.stop(t + ring + 0.05);
      shimmer.stop(t + ring + 0.05);
      const voice = { osc: [osc, shimmer], gain };
      this.live.add(voice);
      osc.onended = () => this.live.delete(voice);
    }

    const last = events[events.length - 1];
    const totalMs = (0.08 + last.time + last.dur) * 1000 + 250;
    this.endTimer = setTimeout(() => this.start(events, moodId, onEnd), totalMs);
    return true;
  }

  /** index of the note sounding right now, or -1 */
  activeIndex(): number {
    if (!this.playing || !this.ctx) return -1;
    const t = this.ctx.currentTime - this.startAt;
    if (t < 0) return -1;
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (t >= this.events[i].time) {
        return t < this.events[i].time + this.events[i].dur + 0.15 ? i : -1;
      }
    }
    return -1;
  }

  stop(notify = true) {
    if (this.endTimer) clearTimeout(this.endTimer);
    this.endTimer = null;
    const wasPlaying = this.playing;
    this.playing = false;
    if (this.ctx) {
      const now = this.ctx.currentTime;
      for (const v of this.live) {
        try {
          v.gain.gain.cancelScheduledValues(now);
          v.gain.gain.setTargetAtTime(0.0001, now, 0.03);
          v.osc.forEach((o) => o.stop(now + 0.2));
        } catch {
          /* already stopped */
        }
      }
      this.live.clear();
    }
    const cb = this.onEnd;
    this.onEnd = null;
    if (notify && wasPlaying && cb) cb();
  }

  dispose() {
    this.stop(false);
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }
}
