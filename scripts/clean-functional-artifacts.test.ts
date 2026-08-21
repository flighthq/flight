import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanFunctionalArtifacts } from './clean-functional-artifacts';

describe('cleanFunctionalArtifacts', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
  });

  it('removes only the functional capture namespace', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-clean-functional-artifacts-'));
    roots.push(root);
    const functionalScreenshot = join(root, '.artifacts', 'functional', 'removed-scene', 'webgl', 'screenshot.png');
    const exampleScreenshot = join(root, '.artifacts', 'examples', 'current-scene', 'webgl', 'screenshot.png');
    mkdirSync(dirname(functionalScreenshot), { recursive: true });
    mkdirSync(dirname(exampleScreenshot), { recursive: true });
    writeFileSync(functionalScreenshot, 'stale');
    writeFileSync(exampleScreenshot, 'current');

    cleanFunctionalArtifacts(root);

    expect(existsSync(join(root, '.artifacts', 'functional'))).toBe(false);
    expect(readFileSync(exampleScreenshot, 'utf8')).toBe('current');
  });

  it('is idempotent when no functional artifacts exist', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-clean-functional-artifacts-'));
    roots.push(root);

    expect(() => cleanFunctionalArtifacts(root)).not.toThrow();
  });

  it('keeps the full functional review command wired through every preparation step', () => {
    const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
    const rootPackage = JSON.parse(readFileSync(resolve(scriptsDirectory, '..', 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const workflow = readFileSync(join(scriptsDirectory, 'review-functional-full.ts'), 'utf8');

    expect(rootPackage.scripts['clean:artifacts:functional']).toBe('tsx ./scripts/clean-functional-artifacts.ts');
    expect(rootPackage.scripts['review:functional:fresh']).toBeUndefined();
    expect(rootPackage.scripts['review:functional:full']).toBe('tsx ./scripts/review-functional-full.ts');

    let previousStep = -1;
    for (const step of [
      "['run', 'build:functional']",
      "['run', 'reference-image:fetch']",
      "['run', 'clean:artifacts:functional']",
      "['run', 'capture:functional']",
      "['run', 'dev', '--workspace=tools/review']",
    ]) {
      const stepIndex = workflow.indexOf(step);
      expect(stepIndex, step).toBeGreaterThan(previousStep);
      previousStep = stepIndex;
    }
    expect(workflow).toContain("VITE_REVIEW_TOOL: 'functional'");
  });
});
