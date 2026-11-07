import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public", { recursive: true });

await build({
  entryPoints: ["src/embed/index.ts"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2019",
  charset: "ascii",
  outfile: "public/embed.js",
  logLevel: "info",
});

// self-host p5 so the embed never depends on a third-party CDN
copyFileSync("node_modules/p5/lib/p5.min.js", "public/p5.min.js");
