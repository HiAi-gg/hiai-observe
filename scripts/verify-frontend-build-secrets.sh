#!/usr/bin/env bash
# Regression check: an inherited build credential must not reach public assets.
# Uses only a synthetic sentinel, never a real API key.
set -euo pipefail
cd "$(dirname "$0")/../frontend"
export HIAI_OBSERVE_API_KEY=canary-build-key-NOT-A-SECRET
export NODE_ENV=production
bun run build
bun -e '
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const sentinel = Buffer.from(process.env.HIAI_OBSERVE_API_KEY);
let files = 0;
let matches = 0;
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) scan(path);
    else {
      files++;
      if (readFileSync(path).includes(sentinel)) matches++;
    }
  }
}
scan("build");
console.log(JSON.stringify({ scannedFiles: files, credentialOccurrences: matches }));
process.exit(files > 0 && matches === 0 ? 0 : 1);
'
