/**
 * Stand-alone embed script. Drop this on any page:
 *
 *   <div data-staff-name="May" data-mood="calm" data-theme="auto" style="height:240px"></div>
 *   <script src="https://YOUR-SITE/embed.js" async></script>
 *
 * It loads p5.js from the same origin as this script (no third-party CDN).
 */
import type p5 from "p5";
import { StaffArt, type Theme } from "../lib/staffArt";
import { isMood, type MoodId } from "../lib/melody";

type P5Ctor = typeof p5;

export interface MountOptions {
  name: string;
  mood?: MoodId;
  theme?: Theme | "auto";
}

const currentScript = document.currentScript as HTMLScriptElement | null;
const origin = currentScript?.src ? new URL(currentScript.src).origin : window.location.origin;

let p5Promise: Promise<P5Ctor> | null = null;
function loadP5(): Promise<P5Ctor> {
  const existing = (window as unknown as { p5?: P5Ctor }).p5;
  if (existing) return Promise.resolve(existing);
  if (!p5Promise) {
    p5Promise = new Promise<P5Ctor>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `${origin}/p5.min.js`;
      s.async = true;
      s.onload = () => {
        const ctor = (window as unknown as { p5?: P5Ctor }).p5;
        if (ctor) resolve(ctor);
        else reject(new Error("p5 did not load"));
      };
      s.onerror = () => reject(new Error("could not load p5"));
      document.head.appendChild(s);
    });
  }
  return p5Promise;
}

async function mount(el: HTMLElement, opts: MountOptions): Promise<{ destroy(): void }> {
  const P5 = await loadP5();
  if (el.getBoundingClientRect().height < 80) el.style.height = "240px";
  if (!el.style.position) el.style.position = "relative";

  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const pref = opts.theme ?? "auto";
  const resolve = (): Theme => (pref === "auto" ? (mq.matches ? "dark" : "light") : pref);

  const art = new StaffArt(P5, el, {
    name: opts.name,
    mood: opts.mood ?? "calm",
    theme: resolve(),
  });
  const onScheme = () => art.setTheme(resolve());
  if (pref === "auto") mq.addEventListener("change", onScheme);

  return {
    destroy() {
      mq.removeEventListener("change", onScheme);
      art.destroy();
    },
  };
}

function autoInit() {
  document.querySelectorAll<HTMLElement>("[data-staff-name]").forEach((el) => {
    if (el.dataset.staffMounted) return;
    el.dataset.staffMounted = "1";
    const mood = el.dataset.mood ?? el.dataset.staffMood;
    const theme = el.dataset.theme ?? el.dataset.staffTheme;
    mount(el, {
      name: el.dataset.staffName ?? "",
      mood: isMood(mood) ? mood : "calm",
      theme: theme === "light" || theme === "dark" ? theme : "auto",
    }).catch(() => {
      delete el.dataset.staffMounted;
    });
  });
}

(window as unknown as { NameStaff: unknown }).NameStaff = { mount, init: autoInit };

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoInit);
else autoInit();
