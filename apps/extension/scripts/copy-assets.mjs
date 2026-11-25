// Copy non-TS assets into dist/ after `tsc`. Keeps the build to tsc + a
// 20-line script (no bundler) — documented choice for Phase 2.
/* global process */
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
await mkdir(join(root, "dist"), { recursive: true });
await cp(join(root, "manifest.json"), join(root, "dist", "manifest.json"));
await cp(join(root, "src", "popup", "popup.html"), join(root, "dist", "popup", "popup.html"));
await cp(join(root, "src", "popup", "popup.css"), join(root, "dist", "popup", "popup.css"));
process.stdout.write("Extension assets copied to dist/\n");
