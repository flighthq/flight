import { rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');

/** Removes only generated functional capture output, leaving other artifact subjects intact. */
export function cleanFunctionalArtifacts(root: string): void {
  rmSync(join(resolve(root), '.artifacts', 'functional'), { force: true, recursive: true });
}

if (resolve(process.argv[1] ?? '') === resolve(scriptPath)) cleanFunctionalArtifacts(repoRoot);
