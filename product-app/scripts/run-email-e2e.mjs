import { spawn } from "node:child_process";
import { resolve } from "node:path";

const processes = [];

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
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
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
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
}

const platformEmail = "platform.acceptance@example.com";
const apiPort = Number(process.env.E2E_API_PORT ?? 4310);
const webPort = Number(process.env.E2E_WEB_PORT ?? 5173);
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const webOrigin = `http://127.0.0.1:${webPort}`;

try {
  start(resolve("node_modules/.bin/tsx"), ["apps/api/src/server.ts"], {
    DATABASE_URL: "pglite://:memory:",
    NODE_ENV: "test",
    AUTH_MODE: "email_otp",
    WEB_ORIGIN: webOrigin,
    API_PORT: String(apiPort),
    EMAIL_PROVIDER: "console",
    PLATFORM_ADMIN_EMAILS: platformEmail,
  });
  await waitFor(`${apiOrigin}/health`);
  start(
    resolve("node_modules/.bin/vite"),
    ["--host", "127.0.0.1", "--port", String(webPort), "--strictPort"],
    { API_ORIGIN: apiOrigin },
    resolve("apps/web"),
  );
  await waitFor(webOrigin);
  const test = start(
    "node",
    ["tests/e2e/public_email_acceptance.mjs"],
    {
      WEB_ORIGIN: webOrigin,
      TEST_PLATFORM_EMAIL: platformEmail,
    },
  );
  const exitCode = await new Promise((resolveExit, reject) => {
    test.once("error", reject);
    test.once("close", (code, signal) => {
      if (code !== 0)
        console.error(`PUBLIC_EMAIL_E2E_PROCESS_EXITED:code=${code ?? "null"}:signal=${signal ?? "none"}`);
      resolveExit(code ?? 1);
    });
  });
  if (exitCode !== 0) process.exitCode = exitCode;
  else console.log("PUBLIC_EMAIL_E2E_SUITE_PASSED");
} finally {
  await stopAll();
}
