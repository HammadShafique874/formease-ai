// Production build wrapper (apps/web).
/* global console, process */
// Vite embeds the WHOLE import.meta.env object in the bundle (config.ts
// reads it via a dynamic key), so a production build that loads the dev
// .env would inline the App Check DEBUG TOKEN into the public bundle — a
// secret that must never ship. To prevent that, stage ONLY .env.production
// into a temp dir and point Vite at it with --envDir. The staging dir is
// removed afterwards, even if the build fails.
// Local `npm run dev` is unaffected: the dev server loads .env as before.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const stage = join(webDir, ".env-build");
const prodEnv = join(webDir, ".env.production");
try {
  rmSync(stage, { recursive: true, force: true });
  let envDir = webDir;
  if (existsSync(prodEnv)) {
    mkdirSync(stage, { recursive: true });
    cpSync(prodEnv, join(stage, ".env.production"));
    envDir = stage;
    console.log("build: staged production env only — dev secrets cannot leak into the bundle");
  } else {
    console.log("build: no .env.production found — building with the default env files");
  }
  const viteCandidates = [
    join(webDir, "node_modules", ".bin", "vite"),
    join(webDir, "..", "..", "node_modules", ".bin", "vite"),
  ];
  const viteBin = viteCandidates.find((p) => existsSync(p));
  if (!viteBin) {
    console.error("build: vite binary not found — run npm install first");
    process.exit(1);
  }
  const result = spawnSync(viteBin, ["build"], {
    cwd: webDir,
    stdio: "inherit",
    env: { ...process.env, FORMEASE_ENV_DIR: envDir },
  });
  if (result.error) {
    console.error(`build: failed to run vite: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
