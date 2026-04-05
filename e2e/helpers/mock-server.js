/**
 * Tiny static HTTP server that serves e2e/fixtures/ on localhost:7777.
 * Used to serve mock-gemini.html without a full framework dependency.
 *
 * Usage:
 *   import { startMockServer, stopMockServer } from "./mock-server.js";
 *   const server = await startMockServer();
 *   // ... run tests ...
 *   await stopMockServer(server);
 */

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "../fixtures");
const PORT = 7777;

const MIME = {
  ".html": "text/html",
  ".js":   "application/javascript",
  ".css":  "text/css",
};

/**
 * Starts the mock server.
 * @returns {Promise<http.Server>}
 */
export function startMockServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const filePath = path.join(FIXTURES_DIR, req.url === "/" ? "mock-gemini.html" : req.url);
      const ext = path.extname(filePath);
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        res.writeHead(200, { "Content-Type": MIME[ext] || "text/plain" });
        res.end(data);
      });
    });

    server.listen(PORT, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  });
}

/**
 * Stops the mock server.
 * @param {http.Server} server
 * @returns {Promise<void>}
 */
export function stopMockServer(server) {
  return new Promise((resolve, reject) => {
    server.close(err => (err ? reject(err) : resolve()));
  });
}

export const MOCK_GEMINI_URL = `http://localhost:${PORT}/mock-gemini.html`;
