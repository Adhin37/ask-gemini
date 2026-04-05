// @ts-check
import { defineConfig } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: "./scenarios",
  // Run scenarios in sequence — extension state is shared across tests in one run
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  // outputDir is top-level — this is where Playwright writes per-test artifact
  // folders (video.webm, screenshots, traces). stitch.mjs reads from here.
  outputDir: path.join(__dirname, "videos"),
  use: {
    actionTimeout: 10_000,
    video: "on",
  },
  // No built-in reporter HTML needed — this is a demo pipeline, not a CI suite
  reporter: [["list"]],
});
