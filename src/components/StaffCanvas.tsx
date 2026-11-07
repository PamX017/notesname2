"use client";

import { useEffect, useRef } from "react";
import type { MoodId } from "@/lib/melody";
import type { StaffArt, Theme } from "@/lib/staffArt";

interface Props {
  name: string;
  mood: MoodId;
  theme: Theme;
  className?: string;
  /** bump to replay the draw-in animation for the same name */
  nonce?: number;
  onPlayingChange?: (playing: boolean) => void;
  /** exposes imperative controls (play / stop) to the parent */
  controlRef?: React.MutableRefObject<{ toggle(): void; stop(): void } | null>;
}

/** Mounts the p5 sketch. p5 is loaded lazily so it never runs on the server. */
export default function StaffCanvas({ name, mood, theme, className, nonce = 0, onPlayingChange, controlRef }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const art = useRef<StaffArt | null>(null);
  const latest = useRef({ name, mood, theme, onPlayingChange });
  latest.current = { name, mood, theme, onPlayingChange };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ default: P5 }, { StaffArt }] = await Promise.all([import("p5"), import("@/lib/staffArt")]);
      if (cancelled || !host.current) return;
      const l = latest.current;
      art.current = new StaffArt(P5, host.current, {
        name: l.name,
        mood: l.mood,
        theme: l.theme,
        onPlayingChange: (v) => latest.current.onPlayingChange?.(v),
      });
      if (controlRef) {
        controlRef.current = {
          toggle: () => art.current?.toggle(),
          stop: () => art.current?.stop(),
        };
      }
    })();
    return () => {
      cancelled = true;
      art.current?.destroy();
      art.current = null;
      if (controlRef) controlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    art.current?.setMood(mood);
  }, [mood]);
  useEffect(() => {
    art.current?.setName(name);
  }, [name, nonce]);
  useEffect(() => {
    art.current?.setTheme(theme);
  }, [theme]);

  return <div ref={host} className={className} />;
}
