#!/usr/bin/env node
/**
 * stitch.mjs — Stitches per-scenario .webm recordings into a single demo.mp4
 *
 * Requirements: ffmpeg must be on PATH.
 *
 * Usage:
 *   node e2e/stitch.mjs                   # reads e2e/videos/, writes e2e/output/demo.mp4
 *   node e2e/stitch.mjs --out my-demo.mp4 # custom output path
 *
 * Playwright names video files with a UUID. This script sorts them by
 * modification time so the scenario order is preserved.
 */

import { execSync }   from "child_process";
import fs             from "fs";
import path           from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── CLI args ─────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const outIdx  = args.indexOf("--out");
const outFile = outIdx !== -1
  ? path.resolve(args[outIdx + 1])
  : path.join(__dirname, "output", "demo.mp4");

const videosDir = path.join(__dirname, "videos");

// ── Collect .webm files ───────────────────────────────────────────────────────
if (!fs.existsSync(videosDir)) {
  console.error(`[stitch] Videos directory not found: ${videosDir}`);
  console.error("  Run: npm run e2e   (to generate recordings first)");
  process.exit(1);
}

// Playwright puts each test's video inside a numbered subdirectory.
// Walk one level deep to find all .webm files.
// Minimum file size to include — filters out blank recordings from transient
// tabs (truly empty pages: < 10 KB; brief background tabs: 10-40 KB).
// Set to 50 KB so static-content pages like the mock article (mostly
// unchanged frames compress aggressively with VP8, landing ~50-150 KB) are
// still included, while one-frame-and-done blank clips are filtered.
const MIN_SIZE_BYTES = 50_000; // 50 KB

const webmFiles = fs.readdirSync(videosDir, { withFileTypes: true })
  .flatMap(entry => {
    if (entry.isDirectory()) {
      const sub = path.join(videosDir, entry.name);
      return fs.readdirSync(sub)
        .filter(f => f.endsWith(".webm"))
        .map(f => {
          const file = path.join(sub, f);
          const { mtimeMs, size } = fs.statSync(file);
          return { file, mtime: mtimeMs, size };
        });
    }
    if (entry.name.endsWith(".webm")) {
      const file = path.join(videosDir, entry.name);
      const { mtimeMs, size } = fs.statSync(file);
      return [{ file, mtime: mtimeMs, size }];
    }
    return [];
  })
  .filter(e => e.size >= MIN_SIZE_BYTES)
  .sort((a, b) => a.mtime - b.mtime)
  .map(e => e.file);

if (webmFiles.length === 0) {
  console.error("[stitch] No .webm files found in", videosDir);
  console.error("  Run: npm run e2e   first.");
  process.exit(1);
}

const allCount = fs.readdirSync(videosDir, { withFileTypes: true })
  .flatMap(e => e.isDirectory()
    ? fs.readdirSync(path.join(videosDir, e.name)).filter(f => f.endsWith(".webm"))
    : e.name.endsWith(".webm") ? [e.name] : []
  ).length;

console.log(`[stitch] ${webmFiles.length} of ${allCount} clips kept (≥ ${MIN_SIZE_BYTES / 1000} KB):`);
webmFiles.forEach(f => {
  const kb = Math.round(fs.statSync(f).size / 1024);
  console.log(`  • ${path.relative(__dirname, f)}  (${kb} KB)`);
});

// ── Write ffmpeg concat list ──────────────────────────────────────────────────
const listFile = path.join(__dirname, "output", "_concat.txt");
fs.mkdirSync(path.dirname(listFile), { recursive: true });
fs.writeFileSync(
  listFile,
  webmFiles.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join("\n") + "\n"
);

// ── Run ffmpeg ────────────────────────────────────────────────────────────────
fs.mkdirSync(path.dirname(outFile), { recursive: true });

const cmd = [
  "ffmpeg", "-y",
  "-f", "concat",
  "-safe", "0",
  "-i", `"${listFile}"`,
  "-c:v", "libx264",
  "-preset", "fast",
  "-crf", "22",
  "-pix_fmt", "yuv420p",  // broad compatibility (Twitter, YouTube, etc.)
  "-movflags", "+faststart",
  `"${outFile}"`,
].join(" ");

console.log("\n[stitch] Running ffmpeg…");
try {
  execSync(cmd, { stdio: "inherit" });
} catch (err) {
  console.error("\n[stitch] ffmpeg failed. Is ffmpeg installed and on PATH?");
  process.exit(1);
}

console.log("\n[stitch] Done →", outFile);

// Clean up concat list
fs.unlinkSync(listFile);
