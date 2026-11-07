import { GLYPHS, SPACE_GLYPH } from "./strokeFont";

export interface Vec {
  x: number;
  y: number;
}

export const MAX_NAME_LENGTH = 16;

/** horizontal stretch so the staff lines have room between strokes */
const X_STRETCH = 1.45;

// built from a string so bundlers never emit raw non-ASCII characters
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

/** Reduce any input to the characters we can draw: a–z and single spaces. */
export function normalizeName(input: string): string {
  return input
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z ]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
}

export interface NameGeometry {
  name: string;
  /** dense centre line, units, y points DOWN, origin = start of first letter on the baseline */
  center: Vec[];
  /** unit normals pointing to the "up" side of the staff (left of travel) */
  normals: Vec[];
  /** unit tangents */
  tangents: Vec[];
  /** index range of the name itself inside `center` (excluding lead-in / tail control points) */
  nameStart: number;
  nameEnd: number;
  /** x extent of the name in units */
  nameWidth: number;
  /** number of drawable letters (no spaces) */
  letterCount: number;
}

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

/** Centripetal Catmull–Rom through `ctrl`; returns dense points + index of each control point. */
function catmullRom(ctrl: Vec[], step: number): { pts: Vec[]; ctrlIndex: number[] } {
  const alpha = 0.5;
  const first = ctrl[0];
  const last = ctrl[ctrl.length - 1];
  const P: Vec[] = [
    { x: 2 * first.x - ctrl[1].x, y: 2 * first.y - ctrl[1].y },
    ...ctrl,
    { x: 2 * last.x - ctrl[ctrl.length - 2].x, y: 2 * last.y - ctrl[ctrl.length - 2].y },
  ];
  const pts: Vec[] = [];
  const ctrlIndex: number[] = [];

  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    const t0 = 0;
    const t1 = t0 + Math.max(dist(p0, p1), 1e-4) ** alpha;
    const t2 = t1 + Math.max(dist(p1, p2), 1e-4) ** alpha;
    const t3 = t2 + Math.max(dist(p2, p3), 1e-4) ** alpha;
    const n = Math.max(4, Math.ceil(dist(p1, p2) / step));
    ctrlIndex.push(pts.length);
    for (let s = 0; s < n; s++) {
      const t = t1 + ((t2 - t1) * s) / n;
      const lerp = (a: Vec, b: Vec, ta: number, tb: number): Vec => {
        const k = (t - ta) / (tb - ta);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      };
      const A1 = lerp(p0, p1, t0, t1);
      const A2 = lerp(p1, p2, t1, t2);
      const A3 = lerp(p2, p3, t2, t3);
      const B1 = lerp(A1, A2, t0, t2);
      const B2 = lerp(A2, A3, t1, t3);
      pts.push(lerp(B1, B2, t1, t2));
    }
  }
  ctrlIndex.push(pts.length);
  pts.push(P[P.length - 2]);
  return { pts, ctrlIndex };
}

export function buildGeometry(input: string): NameGeometry | null {
  const name = normalizeName(input);
  if (!name) return null;

  const ctrl: Vec[] = [{ x: -0.8, y: 0 }, { x: 0, y: 0 }];
  let xo = 0;
  let letterCount = 0;
  for (const ch of name) {
    const glyph = ch === " " ? SPACE_GLYPH : GLYPHS[ch];
    if (!glyph) continue;
    if (ch !== " ") letterCount++;
    for (const [px, py] of glyph.pts) ctrl.push({ x: xo + px * X_STRETCH, y: -py });
    xo += glyph.w * X_STRETCH;
  }
  const nameEndCtrl = ctrl.length - 1;
  ctrl.push({ x: xo + 0.8, y: 0 });

  const { pts, ctrlIndex } = catmullRom(ctrl, 0.03);

  // tangents + normals, lightly smoothed
  const n = pts.length;
  const tangents: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 3)];
    const b = pts[Math.min(n - 1, i + 3)];
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    tangents.push({ x: (b.x - a.x) / d, y: (b.y - a.y) / d });
  }
  const normals: Vec[] = tangents.map((t) => ({ x: t.y, y: -t.x }));
  const smoothed: Vec[] = normals.map((_, i) => {
    let sx = 0, sy = 0;
    for (let k = -5; k <= 5; k++) {
      const m = normals[Math.min(n - 1, Math.max(0, i + k))];
      sx += m.x;
      sy += m.y;
    }
    const d = Math.hypot(sx, sy) || 1;
    return { x: sx / d, y: sy / d };
  });

  return {
    name,
    center: pts,
    normals: smoothed,
    tangents,
    nameStart: ctrlIndex[1],
    nameEnd: ctrlIndex[nameEndCtrl],
    nameWidth: xo,
    letterCount,
  };
}

/** How many notes this name gets. */
export function noteCountFor(geo: NameGeometry): number {
  return Math.min(36, Math.max(12, geo.letterCount * 3));
}

/** Evenly spaced (by arc length) indices into `center` where notes sit. */
export function placeNotes(geo: NameGeometry, count: number): number[] {
  const { center, nameStart, nameEnd } = geo;
  const cum: number[] = [0];
  for (let i = nameStart + 1; i <= nameEnd; i++) {
    cum.push(cum[cum.length - 1] + dist(center[i - 1], center[i]));
  }
  const total = cum[cum.length - 1];
  const from = total * 0.03;
  const to = total * 0.97;
  const out: number[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = from + ((to - from) * (k + 0.5)) / count;
    while (j < cum.length - 1 && cum[j] < target) j++;
    out.push(nameStart + j);
  }
  return out;
}
