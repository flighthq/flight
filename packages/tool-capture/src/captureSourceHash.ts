import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Entry } from './captureEntries.js';
import { functionalScene3DFile } from './functionalScene3Ds.js';

/** Returns the SHA-256 of the built-in scene source for one capture target, or null when it has no local source. */
export function getCaptureSceneSourceHash(
  root: string,
  subject: string,
  entry: Readonly<Entry>,
  renderer: string,
): string | null {
  const path = getCaptureSceneSourcePath(root, subject, entry, renderer);
  if (path === null || !existsSync(path)) return null;
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function getCaptureSceneSourcePath(
  root: string,
  subject: string,
  entry: Readonly<Entry>,
  renderer: string,
): string | null {
  if (subject === 'functional') {
    const separator = renderer.indexOf(':');
    const backend = separator === -1 ? renderer : renderer.slice(separator + 1);
    return functionalScene3DFile(join(root, 'functional', 'scenes'), entry.name, backend);
  }
  if (subject === 'examples') return join(root, 'examples', 'packages', entry.name, 'src', 'app.ts');
  return null;
}
