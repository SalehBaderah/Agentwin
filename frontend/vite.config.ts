import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
const backend = process.env.AGENTWIN_BACKEND_URL || "http://127.0.0.1:8000";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  server: { proxy: { "/api": { target: backend, ws: true } } },
});
