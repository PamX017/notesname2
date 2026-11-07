"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import StaffCanvas from "@/components/StaffCanvas";
import { isMood } from "@/lib/melody";
import type { Theme } from "@/lib/staffArt";

function Embed() {
  const params = useSearchParams();
  const name = params.get("name") ?? "";
  const moodParam = params.get("mood");
  const mood = isMood(moodParam) ? moodParam : "calm";
  const themeParam = params.get("theme");
  const [theme, setTheme] = useState<Theme>(themeParam === "dark" ? "dark" : "light");

  useEffect(() => {
    // the embedded page is transparent so it sits on the host site's background
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.overflow = "hidden";

    if (themeParam === "light" || themeParam === "dark") {
      setTheme(themeParam);
      return;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setTheme(mq.matches ? "dark" : "light");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [themeParam]);

  return <StaffCanvas className="embedRoot" name={name} mood={mood} theme={theme} />;
}

export default function EmbedPage() {
  return (
    <Suspense fallback={null}>
      <Embed />
    </Suspense>
  );
}
