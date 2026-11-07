import type p5 from "p5";
import { buildGeometry, noteCountFor, placeNotes, type NameGeometry } from "./geometry";
import { composeMelody, MOODS, type MoodId, type NoteEvent } from "./melody";
import { NotePlayer } from "./audio";

export type Theme = "light" | "dark";
type RGB = [number, number, number];

const PALETTE: Record<Theme, { line: RGB; note: RGB; hint: RGB; accent: RGB }> = {
  light: { line: [120, 120, 120], note: [20, 20, 20], hint: [135, 135, 135], accent: [216, 27, 122] },
  dark: { line: [165, 165, 165], note: [244, 244, 244], hint: [140, 140, 140], accent: [255, 92, 170] },
};

const STAFF_GAP = 0.07; // distance between staff lines, in glyph units
const REVEAL_MS = 2000;

export interface ArtOptions {
  name?: string;
  mood?: MoodId;
  theme?: Theme;
  onPlayingChange?: (playing: boolean) => void;
}

interface ScreenNote {
  x: number;
  y: number;
  /** unit vectors: up-normal and tangent in screen space */
  nx: number;
  ny: number;
  tx: number;
  ty: number;
  /** index into the reveal polyline */
  at: number;
  stemUp: boolean;
  flag: boolean;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export class StaffArt {
  private p!: p5;
  private ready = false;
  private canvasEl: HTMLCanvasElement | null = null;
  private ro: ResizeObserver | null = null;
  private player = new NotePlayer();

  private name = "";
  private mood: MoodId;
  private theme: Theme;
  private onPlayingChange?: (playing: boolean) => void;

  private geo: NameGeometry | null = null;
  private events: NoteEvent[] = [];
  private noteIdx: number[] = [];

  // layout (screen space)
  private w = 300;
  private h = 200;
  private u = 40;
  private lines: Float32Array[] = [];
  private cum: Float32Array = new Float32Array(0);
  private total = 1;
  private notes: ScreenNote[] = [];
  private hintX = 0;
  private hintY = 0;
  private revealStart = 0;

  constructor(
    P5: typeof p5,
    private el: HTMLElement,
    opts: ArtOptions = {},
  ) {
    this.mood = opts.mood ?? "calm";
    this.theme = opts.theme ?? "light";
    this.onPlayingChange = opts.onPlayingChange;
    this.name = opts.name ?? "";
    this.rebuild();

    this.p = new P5((p: p5) => {
      p.setup = () => {
        this.measure();
        const cnv = p.createCanvas(this.w, this.h);
        p.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
        const elt = cnv.elt as HTMLCanvasElement;
        this.canvasEl = elt;
        elt.style.display = "block";
        elt.style.cursor = "pointer";
        elt.style.touchAction = "manipulation";
        elt.tabIndex = 0;
        elt.setAttribute("role", "button");
        elt.addEventListener("click", () => this.toggle());
        elt.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            this.toggle();
          }
        });
        this.ready = true;
        this.updateAria();
        this.layout();
        this.revealStart = p.millis();
      };
      p.draw = () => this.draw(p);
    }, this.el);

    this.ro = new ResizeObserver(() => {
      if (!this.ready) return;
      this.measure();
      this.p.resizeCanvas(this.w, this.h, true);
      this.layout();
      this.kick(false);
    });
    this.ro.observe(this.el);
  }

  // ---- public API ---------------------------------------------------------

  setName(name: string) {
    this.stop();
    this.name = name;
    this.rebuild();
    this.layout();
    this.updateAria();
    if (this.ready) this.revealStart = this.p.millis();
    this.kick(true);
  }

  setMood(mood: MoodId) {
    if (mood === this.mood) return;
    this.stop();
    this.mood = mood;
    this.rebuild();
    this.layout();
    this.kick(false);
  }

  setTheme(theme: Theme) {
    this.theme = theme;
    this.kick(false);
  }

  get isPlaying() {
    return this.player.playing;
  }

  play() {
    if (!this.geo || this.events.length === 0) return;
    const ok = this.player.start(this.events, this.mood, () => {
      this.updateAria();
      this.onPlayingChange?.(false);
      this.kick(false);
    });
    if (!ok) return;
    this.updateAria();
    this.onPlayingChange?.(true);
    this.kick(false);
  }

  stop() {
    if (this.player.playing) this.player.stop(true);
  }

  toggle() {
    if (this.player.playing) this.stop();
    else this.play();
  }

  destroy() {
    this.ro?.disconnect();
    this.player.dispose();
    this.ready = false;
    this.p?.remove();
  }

  // ---- internals ----------------------------------------------------------

  private rebuild() {
    this.geo = buildGeometry(this.name);
    if (this.geo) {
      const count = noteCountFor(this.geo);
      this.noteIdx = placeNotes(this.geo, count);
      this.events = composeMelody(this.geo.name, this.mood, this.noteIdx.length);
    } else {
      this.noteIdx = [];
      this.events = [];
    }
  }

  private updateAria() {
    const elt = this.canvasEl;
    if (!elt) return;
    const label = this.geo ? `${this.geo.name} written on a music staff` : "empty music staff";
    elt.setAttribute("aria-label", this.player.playing ? `Stop playing: ${label}` : `Play melody: ${label}`);
    elt.setAttribute("aria-pressed", String(this.player.playing));
  }

  private measure() {
    const r = this.el.getBoundingClientRect();
    this.w = Math.max(160, Math.floor(r.width || this.el.clientWidth || 300));
    this.h = Math.max(120, Math.floor(r.height || this.el.clientHeight || 200));
  }

  /** Turn geometry (glyph units) into screen-space polylines and notes. */
  private layout() {
    const { w, h } = this;
    const geo = this.geo;
    const nameW = geo ? geo.nameWidth : 2.5;

    // vertical budget in units: ascender 2 + stems, descender 1 + stems, hint line
    const BUDGET = 4.4;
    const u = Math.max(10, Math.min((w * 0.62) / Math.max(nameW, 2.5), h / BUDGET, 90));
    this.u = u;
    const x0 = Math.max(14, Math.min(w * 0.12, w - nameW * u - 28));
    const top = Math.max(0, (h - BUDGET * u) / 2);
    const baseY = top + 2.5 * u;
    const gap = STAFF_GAP * u;

    const EXT = 14; // px between points on the straight extensions
    const lines: Float32Array[] = [];

    if (!geo) {
      // empty state: a calm flat staff across the canvas
      const count = Math.ceil((w + 12) / EXT) + 1;
      for (let k = -2; k <= 2; k++) {
        const arr = new Float32Array(count * 2);
        for (let i = 0; i < count; i++) {
          arr[i * 2] = -6 + i * EXT;
          arr[i * 2 + 1] = baseY - k * gap;
        }
        lines.push(arr);
      }
      this.lines = lines;
      this.notes = [];
      this.hintX = x0;
      this.hintY = baseY + 1.7 * u;
      this.computeCum();
      return;
    }

    const c = geo.center;
    const first = { x: x0 + c[0].x * u, y: baseY + c[0].y * u };
    const last = { x: x0 + c[c.length - 1].x * u, y: baseY + c[c.length - 1].y * u };
    const leftN = Math.max(1, Math.ceil((first.x + 6) / EXT));
    const rightN = Math.max(1, Math.ceil((w + 6 - last.x) / EXT));
    const total = leftN + c.length + rightN;

    for (let k = -2; k <= 2; k++) {
      const arr = new Float32Array(total * 2);
      let o = 0;
      const off = k * gap;
      // left extension (horizontal, ends at the first centre point)
      const fy = first.y - off; // normal at the start is straight up
      for (let i = 0; i < leftN; i++) {
        arr[o++] = first.x - (leftN - i) * ((first.x + 6) / leftN);
        arr[o++] = fy;
      }
      for (let i = 0; i < c.length; i++) {
        const n = geo.normals[i];
        arr[o++] = x0 + c[i].x * u + n.x * off;
        arr[o++] = baseY + c[i].y * u + n.y * off;
      }
      const ly = last.y - off;
      for (let i = 1; i <= rightN; i++) {
        arr[o++] = last.x + i * ((w + 6 - last.x) / rightN);
        arr[o++] = ly;
      }
      lines.push(arr);
    }
    this.lines = lines;
    this.computeCum();

    // notes
    const notes: ScreenNote[] = [];
    for (let j = 0; j < this.noteIdx.length; j++) {
      const ci = this.noteIdx[j];
      const ev = this.events[j];
      if (!ev) continue;
      const n = geo.normals[ci];
      const t = geo.tangents[ci];
      const off = ev.staff * 0.5 * gap;
      notes.push({
        x: x0 + c[ci].x * u + n.x * off,
        y: baseY + c[ci].y * u + n.y * off,
        nx: n.x,
        ny: n.y,
        tx: t.x,
        ty: t.y,
        at: leftN + ci,
        stemUp: ev.staff < 0,
        flag: ev.flag,
      });
    }
    this.notes = notes;
    this.hintX = x0 + 0.1 * u;
    this.hintY = baseY + 1.75 * u;
  }

  private computeCum() {
    const mid = this.lines[2];
    const n = mid.length / 2;
    const cum = new Float32Array(n);
    for (let i = 1; i < n; i++) {
      cum[i] = cum[i - 1] + Math.hypot(mid[i * 2] - mid[i * 2 - 2], mid[i * 2 + 1] - mid[i * 2 - 1]);
    }
    this.cum = cum;
    this.total = cum[n - 1] || 1;
  }

  private kick(restartReveal: boolean) {
    if (!this.ready) return;
    if (restartReveal) this.revealStart = this.p.millis();
    this.p.loop();
  }

  private draw(p: p5) {
    const pal = PALETTE[this.theme];
    p.clear();

    const rt = Math.min(1, (p.millis() - this.revealStart) / REVEAL_MS);
    const f = this.geo ? easeOut(rt) : 1;
    const limit = f * this.total;

    // how many points are visible
    const mid = this.cum;
    let count = mid.length;
    if (f < 1) {
      let lo = 0, hi = mid.length - 1;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (mid[m] < limit) lo = m + 1;
        else hi = m;
      }
      count = lo + 1;
    }

    // staff lines
    p.noFill();
    p.stroke(pal.line[0], pal.line[1], pal.line[2], 200);
    p.strokeWeight(1);
    for (const line of this.lines) {
      p.beginShape();
      for (let i = 0; i < count; i++) p.vertex(line[i * 2], line[i * 2 + 1]);
      p.endShape();
    }

    // notes
    const active = this.player.activeIndex();
    const g = STAFF_GAP * this.u;
    for (let j = 0; j < this.notes.length; j++) {
      const n = this.notes[j];
      if (n.at >= count) break;
      this.drawNote(p, n, g, j === active, pal);
    }

    // hint
    if (this.geo && rt >= 1) {
      p.noStroke();
      p.fill(pal.hint[0], pal.hint[1], pal.hint[2]);
      p.textFont("Helvetica, Arial, sans-serif");
      p.textSize(Math.max(11, Math.min(14, this.u * 0.3)));
      p.textAlign(p.LEFT, p.BASELINE);
      p.text(this.player.playing ? "stop playing" : "click to play ♪", this.hintX, this.hintY);
    }

    const animating = rt < 1 || this.player.playing;
    if (!animating) p.noLoop();
  }

  private drawNote(p: p5, n: ScreenNote, g: number, active: boolean, pal: (typeof PALETTE)[Theme]) {
    const col = active ? pal.accent : pal.note;
    const k = active ? 1.45 : 1;
    const hw = 0.9 * g * k;
    const hh = 0.6 * g * k;
    const ang = Math.atan2(n.ty, n.tx) - 0.35;

    p.push();
    p.translate(n.x, n.y);

    if (active) {
      p.noFill();
      p.stroke(col[0], col[1], col[2], 90);
      p.strokeWeight(1);
      p.circle(0, 0, g * 5);
    }

    // stem
    const side = n.stemUp ? 1 : -1;
    const sx = n.tx * hw * 0.92 * side;
    const sy = n.ty * hw * 0.92 * side;
    const dir = n.stemUp ? 1 : -1;
    const len = g * 3.4 * k;
    const ex = sx + n.nx * len * dir;
    const ey = sy + n.ny * len * dir;
    p.stroke(col[0], col[1], col[2]);
    p.strokeWeight(Math.max(1, g * 0.2));
    p.line(sx, sy, ex, ey);

    // flag
    if (n.flag) {
      p.noFill();
      p.strokeWeight(Math.max(1, g * 0.22));
      const fx = n.tx * g * 1.3 * side;
      const fy = n.ty * g * 1.3 * side;
      p.bezier(
        ex, ey,
        ex + fx * 0.5, ey + fy * 0.5 - n.ny * g * 0.6 * dir,
        ex + fx, ey + fy - n.ny * g * 1.2 * dir,
        ex + fx * 0.6, ey + fy - n.ny * g * 2.0 * dir,
      );
    }

    // head
    p.noStroke();
    p.fill(col[0], col[1], col[2]);
    p.rotate(ang);
    p.ellipse(0, 0, hw * 2, hh * 2);
    p.pop();
  }
}

export { MOODS };
