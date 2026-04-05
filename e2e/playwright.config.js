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
  use: {
    // Slow down actions so the recording looks deliberate
    actionTimeout: 10_000,
    // Video is captured per test; stitch.mjs assembles them into one clip
    video: "on",
    // Artifacts go here
    outputDir: path.join(__dirname, "videos"),
  },
  // No built-in reporter HTML needed — this is a demo pipeline, not a CI suite
  reporter: [["list"]],
});
