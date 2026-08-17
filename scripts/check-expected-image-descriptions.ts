// Reporter only — NOT a gate. Exits 0 regardless of how many scenes lack a description. The field is
// optional during rollout (110 functional scenes using createFunctionalTarget); this becomes a gate once
// coverage reaches a threshold worth enforcing, at which point add a process.exitCode and register it in
// scripts/check.ts.
//
// The unit is load-bearing and is why it is spelled out. An earlier revision of this line read "500+
// scenes", which was the scene-times-renderer CELL count wearing the word "scenes" — the two are 4.5x
// apart and both get called scenes in conversation. A reader sizing this rollout against 500 concludes
// the work is nowhere close when against the right unit it is nearly done, so the denominator error
// changes what someone decides to do, not just what they report.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), '..');
const scenesDir = join(root, 'functional', 'scenes');

export function findScenesWithoutExpectedImageDescription(scenesDirectory: string): string[] {
  return readdirSync(scenesDirectory)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .filter((f) => {
      const content = readFileSync(join(scenesDirectory, f), 'utf8');
      return content.includes('createFunctionalTarget') && !content.includes('expectedImageDescription');
    })
    .map((f) => f.replace(/\.ts$/, ''))
    .sort();
}

function countScenesWithFunctionalTarget(scenesDirectory: string): number {
  return readdirSync(scenesDirectory)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .filter((f) => readFileSync(join(scenesDirectory, f), 'utf8').includes('createFunctionalTarget')).length;
}

const missing = findScenesWithoutExpectedImageDescription(scenesDir);
const targetScenes = countScenesWithFunctionalTarget(scenesDir);
const described = targetScenes - missing.length;

console.log(`expectedImageDescription: ${described}/${targetScenes} functional scenes have a description\n`);
if (missing.length > 0) {
  console.log(`${missing.length} scene(s) missing expectedImageDescription:`);
  for (const name of missing) {
    console.log(`  - ${name}`);
  }
}
