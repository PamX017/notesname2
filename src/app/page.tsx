"use client";

import { useEffect, useRef, useState } from "react";
import StaffCanvas from "@/components/StaffCanvas";
import { useTheme, type ThemePref } from "@/components/useTheme";
import { MOODS, MOOD_IDS, type MoodId } from "@/lib/melody";
import { MAX_NAME_LENGTH, normalizeName } from "@/lib/geometry";

interface Applied {
  name: string;
  mood: MoodId;
  nonce: number;
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }
  return (
    <div className="code">
      <pre aria-label={label}>{code}</pre>
      <button type="button" onClick={copy}>
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}

export default function Home() {
  const { pref, resolved, setPref } = useTheme();
  const [input, setInput] = useState("");
  const [mood, setMood] = useState<MoodId>("calm");
  const [applied, setApplied] = useState<Applied | null>(null);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [origin, setOrigin] = useState("https://YOUR-SITE");
  const control = useRef<{ toggle(): void; stop(): void } | null>(null);

  useEffect(() => setOrigin(window.location.origin), []);

  function generate(e: React.FormEvent) {
    e.preventDefault();
    const name = normalizeName(input);
    if (!name) {
      setError("Type a name using the letters A–Z.");
      return;
    }
    setError("");
    setApplied((prev) => ({ name, mood, nonce: (prev?.nonce ?? 0) + 1 }));
  }

  const name = applied?.name ?? "";
  const m = applied?.mood ?? mood;
  const snippet = `<div data-staff-name="${name}" data-mood="${m}" data-theme="auto" style="height:240px"></div>\n<script src="${origin}/embed.js" async></script>`;
  const embedUrl = `${origin}/embed?name=${encodeURIComponent(name)}&mood=${m}&theme=auto`;
  const iframe = `<iframe src="${embedUrl}" title="${name} on a music staff" width="100%" height="260" style="border:0" loading="lazy"></iframe>`;

  return (
    <main className="wrap">
      <div className="topbar">
        <span className="brand"> notesname {"♪"}</span>
        <div className="seg" role="group" aria-label="Theme">
          {(["system", "light", "dark"] as ThemePref[]).map((t) => (
            <button key={t} type="button" aria-pressed={pref === t} onClick={() => setPref(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <h1>Write your name on a notesname.</h1>
      <p className="lede">
        Type a name, generate, and watch it draw itself in handwriting made of staff lines. Press play to hear the
        melody hiding in the letters, then embed it on your own site.
      </p>

      <form className="form" onSubmit={generate}>
        <input
          type="text"
          value={input}
          maxLength={MAX_NAME_LENGTH + 4}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Your name"
          aria-label="Name"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <select value={mood} onChange={(e) => setMood(e.target.value as MoodId)} aria-label="Mood">
          {MOOD_IDS.map((id) => (
            <option key={id} value={id}>
              {MOODS[id].label}
            </option>
          ))}
        </select>
        <button className="btn accent" type="submit">
          Generate
        </button>
      </form>
      <p className="error" role="alert">
        {error}
      </p>

      <section className="preview" aria-label="Preview">
        <StaffCanvas
          className="canvasHost"
          name={name}
          mood={m}
          theme={resolved}
          nonce={applied?.nonce ?? 0}
          onPlayingChange={setPlaying}
          controlRef={control}
        />
        <div className="previewBar">
          <span>{applied ? `${applied.name} · ${MOODS[applied.mood].label.toLowerCase()}` : "Your preview will appear here"}</span>
          <button className="btn ghost" type="button" disabled={!applied} onClick={() => control.current?.toggle()}>
            {playing ? "■ Stop" : "▶ Play"}
          </button>
        </div>
      </section>

      {applied && (
        <section className="share" aria-label="Embed">
          <div>
            <h2>Embed snippet</h2>
            <p>Paste this anywhere on your site. It draws and plays right in the page.</p>
            <CodeBlock code={snippet} label="Embed snippet" />
          </div>
          <div>
            <h2>Embed link (iframe)</h2>
            <p>One line, hosted here. Works in any site builder that accepts an iframe.</p>
            <CodeBlock code={iframe} label="Iframe embed code" />
            <div className="links" style={{ marginTop: 10 }}>
              <a href={embedUrl} target="_blank" rel="noreferrer">
                Open embed link {"↗"}
              </a>
            </div>
          </div>
        </section>
      )}

      <p className="foot">Letters A–Z only, up to {MAX_NAME_LENGTH} characters. Each name gets its own tune.</p>
    </main>
  );
}
