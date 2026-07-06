import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { downloadConsumerAssets } from './asset-cache';

// Warm the whole shared asset cache in one shot: download every consumer's manifest (all example
// packages plus the functional/reference suites) into .cache/assets/<consumer>. This is the
// top-level `npm run assets` escape hatch for CI and offline prep; the per-consumer predev/prebuild
// hooks fetch only what a single project needs.
const projectRoot = resolve(fileURLToPath(import.meta.url), '../..');

function hasManifest(dir: string): boolean {
  return existsSync(join(dir, 'assets.manifest.json'));
}

const consumers: string[] = [];

const examplesDir = join(projectRoot, 'examples', 'packages');
if (existsSync(examplesDir)) {
  for (const entry of readdirSync(examplesDir, { withFileTypes: true })) {
    if (entry.isDirectory() && hasManifest(join(examplesDir, entry.name))) {
      consumers.push(join(examplesDir, entry.name));
    }
  }
}

for (const suite of ['functional', 'reference']) {
  const dir = join(projectRoot, 'tools', suite);
  if (hasManifest(dir)) consumers.push(dir);
}

for (const dir of consumers) {
  console.log(`\n${dir}`);
  await downloadConsumerAssets(dir);
}
