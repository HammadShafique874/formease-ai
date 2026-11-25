import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Production builds (scripts/build.mjs) set FORMEASE_ENV_DIR to a staging
// dir containing ONLY .env.production, so the App Check debug token from the
// dev .env can never be inlined into the public bundle. The dev server does
// not set it and keeps loading .env as before.
export default defineConfig({
  plugins: [react()],
  envDir: process.env.FORMEASE_ENV_DIR ?? ".",
  server: { port: 5173 },
  preview: { port: 4173 },
});
