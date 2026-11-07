# Name Staff

Type a name → **Generate** → the name draws itself in cursive made of five staff lines, with notes
along the stroke. **Play** to hear a melody generated from the name. Share it with an embed snippet
or an iframe link. Next.js (App Router) + TypeScript + p5.js. Light and dark themes.

## Run

```bash
npm install
npm run dev        # http://localhost:3000  (builds public/embed.js first)
npm run build && npm start
```

## How it works

| File | Job |
| --- | --- |
| `src/lib/strokeFont.ts` | Single-stroke cursive glyphs a–z, each one continuous pen path that ends on the baseline so letters join |
| `src/lib/geometry.ts` | Joins glyphs, smooths them (Catmull–Rom), computes normals and note positions |
| `src/lib/melody.ts` | Moods + a seeded pentatonic random walk: same name → same tune, always pleasant |
| `src/lib/audio.ts` | Web Audio synth (no audio files) |
| `src/lib/staffArt.ts` | The p5 sketch: 5 offset staff lines, draw-in animation, notes, highlight while playing |
| `src/embed/index.ts` | Bundled by esbuild into `public/embed.js`; loads `public/p5.min.js` from the same origin |
| `src/app/embed/page.tsx` | The page that iframes point at: `/embed?name=May&mood=calm&theme=auto` |

## Embedding

Snippet:

```html
<div data-staff-name="May" data-mood="calm" data-theme="auto" style="height:240px"></div>
<script src="https://YOUR-SITE/embed.js" async></script>
```

Iframe:

```html
<iframe src="https://YOUR-SITE/embed?name=May&mood=calm&theme=auto" width="100%" height="260" style="border:0"></iframe>
```

Options: `mood` = calm | playful | dreamy, `theme` = auto | light | dark.
Sound starts on click (browsers block autoplay).

## Tweaking the look

- Handwriting shapes: `GLYPHS` in `strokeFont.ts` (points are x right, y up, baseline 0, x-height 1).
- Letter spacing: `X_STRETCH` in `geometry.ts`. Staff line spacing: `STAFF_GAP` in `staffArt.ts`.
- Colours: `PALETTE` in `staffArt.ts` and the CSS variables in `src/app/globals.css`.
