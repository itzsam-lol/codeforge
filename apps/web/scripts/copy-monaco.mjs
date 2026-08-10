// Self-host Monaco's static assets instead of the default CDN load
// (@monaco-editor/react pulls from jsdelivr unless told otherwise). This
// removes an external network dependency from the candidate test-taking
// path — relevant since candidates load this on whatever connection/hardware
// they have, and a slow/blocked CDN request would otherwise stall the editor.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dest = join(__dirname, "..", "public", "monaco-editor", "vs");

const candidates = [
  join(__dirname, "..", "node_modules", "monaco-editor", "min", "vs"),
  join(__dirname, "..", "..", "..", "node_modules", "monaco-editor", "min", "vs"),
];
const src = candidates.find(existsSync);

if (!src) {
  console.warn(
    "[copy-monaco] monaco-editor package not found in node_modules; skipping. " +
      "The editor will fall back to loading from the CDN until `npm install` has run."
  );
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`[copy-monaco] copied ${src} -> ${dest}`);
