import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:4310";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [".trycloudflare.com"],
    proxy: { "/api": apiOrigin, "/public": apiOrigin, "/health": apiOrigin },
  },
  build: { sourcemap: true }
});
