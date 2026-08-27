import { spawn } from "node:child_process";

const children = [
  spawn(process.execPath, ["apps/api/dist/server.js"], {
    stdio: "inherit",
    env: process.env,
  }),
  spawn(process.execPath, ["apps/worker/dist/index.js"], {
    stdio: "inherit",
    env: {
      ...process.env,
      INTERNAL_API_URL: `http://127.0.0.1:${process.env.PORT ?? process.env.API_PORT ?? 4310}`,
    },
  }),
];

let stopping = false;
const stop = (signal = "SIGTERM") => {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill(signal);
};

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (!stopping) {
      stop();
      process.exitCode = code ?? (signal ? 1 : 0);
    }
  });
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
