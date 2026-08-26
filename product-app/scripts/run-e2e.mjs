import { spawn } from "node:child_process";
import { resolve } from "node:path";

const processes = [];
const apiPort = Number(process.env.E2E_API_PORT ?? 4310);
const webPort = Number(process.env.E2E_WEB_PORT ?? 5173);
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const webOrigin = `http://127.0.0.1:${webPort}`;

function start(command, args, environment = {}, cwd = process.cwd()) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...environment },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  processes.push(child);
  return child;
}

async function waitFor(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`E2E_SERVER_NOT_READY:${url}`);
}

async function stopAll() {
  for (const child of processes.reverse()) {
    if (!child.pid || child.killed) continue;
    try {
      if (process.platform === "win32") child.kill("SIGTERM");
      else process.kill(-child.pid, "SIGTERM");
    } catch {}
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}

try {
  start(resolve("node_modules/.bin/tsx"), ["apps/api/src/server.ts"], {
    DATABASE_URL: "pglite://:memory:",
    NODE_ENV: "test",
    AUTH_MODE: "development_mock",
    WEB_ORIGIN: webOrigin,
    API_PORT: String(apiPort),
  });
  await waitFor(`${apiOrigin}/health`);
  start(
    resolve("node_modules/.bin/vite"),
    ["--host", "127.0.0.1", "--port", String(webPort), "--strictPort"],
    { API_ORIGIN: apiOrigin },
    resolve("apps/web"),
  );
  await waitFor(webOrigin);
  const test = start("node", ["tests/e2e/formal_product_flow.mjs"], {
    API_ORIGIN: apiOrigin,
    WEB_ORIGIN: webOrigin,
  });
  const exitCode = await new Promise((resolve, reject) => {
    test.once("error", reject);
    // Wait for stdio to close so the success marker and any final failure
    // diagnostics cannot be lost when the server process groups are stopped.
    test.once("close", (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) process.exitCode = exitCode;
  else console.log("FORMAL_PRODUCT_E2E_SUITE_PASSED");
} finally {
  await stopAll();
}
