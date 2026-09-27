import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const srcDir = join(root, 'packages', 'scene3d-formats', 'src');

// The orchestrator, and the modules it is allowed to reach. Anything else in this package's COLLADA surface is a
// FEATURE module, and the point of the decomposition is that the orchestrator cannot reach one.
const ORCHESTRATOR = 'colladaParse.ts';
const ALLOWED_LOCAL = new Set(['colladaXml.ts', 'colladaSceneShared.ts', 'shared.ts']);

// Packages only a feature needs. A COLLADA parse that reads no cameras has no business linking `@flighthq/camera`,
// and the orchestrator naming any of these is the coupling this file exists to prevent.
const FEATURE_PACKAGES = [
  '@flighthq/animation',
  '@flighthq/camera',
  '@flighthq/color',
  '@flighthq/lighting',
  '@flighthq/mesh',
];

// The fixture pairs that price the boundary, and the minimum saving each must show. The thresholds are set well
// below the measured figures and well above anything a decoder shim could produce — a shim moves tens of bytes, and
// the first version of these fixtures (which routed through `parseCollada`, whose default names every decoder)
// measured an 18-byte spread across all four. That failure is the reason a margin is asserted rather than an
// inequality.
const SAVINGS: readonly (readonly [string, string, number])[] = [
  ['collada-import-geometry', 'collada-import', 0.35],
  ['collada-import-static', 'collada-import', 0.2],
  ['collada-import-animated', 'collada-import', 0.1],
];

describe('collada decoder locality', () => {
  // ★ THE STRUCTURAL HALF OF THE CLAIM. A bundle measurement can be satisfied by luck — a bundler that happened to
  // shake something — where this cannot: the orchestrator's import list either names a feature or it does not.
  it('keeps the orchestrator free of every feature module and feature-only package', () => {
    const source = codeOf(join(srcDir, ORCHESTRATOR));
    const specifiers = [...source.matchAll(/from '([^']+)';/g)].map((match) => match[1]);

    for (const specifier of specifiers) {
      if (!specifier.startsWith('./')) continue;
      expect(ALLOWED_LOCAL.has(specifier.slice(2)), `${ORCHESTRATOR} imports ${specifier}`).toBe(true);
    }
    for (const feature of FEATURE_PACKAGES) {
      expect(source.includes(`from '${feature}/contract'`), `${ORCHESTRATOR} imports ${feature}`).toBe(false);
    }
  });

  // ★ AND THE PRESET MUST STAY OFF THE SELECTIVE PATH. `colladaAllElementDecoders` names all six decoders, so any
  // module on the path a selective caller takes would drag the whole family in — which is exactly what the first
  // measurement caught when the fixtures went through `parseCollada`.
  it('names the full preset only from the module that owns the default', () => {
    const owners: string[] = [];
    for (const file of readdirSync(srcDir)) {
      if (!file.startsWith('collada') || !file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
      if (file === 'colladaDecoderFamily.ts') continue;
      if (codeOf(join(srcDir, file)).includes('colladaAllElementDecoders')) owners.push(file);
    }
    expect(owners).toEqual(['colladaDocument.ts']);
  });

  // Each feature module must be reachable from its own decoder and nothing else, which is what makes omitting the
  // decoder omit the code. Asserted as "no other COLLADA module imports it".
  it('gives each feature module exactly one importer inside the package', () => {
    const features = readdirSync(srcDir).filter(
      (file) => file.startsWith('collada') && file.endsWith('Decoder.ts') && !file.endsWith('.test.ts'),
    );
    expect(features.length).toBeGreaterThanOrEqual(6);
    for (const feature of features) {
      const importers = readdirSync(srcDir).filter((file) => {
        if (!file.endsWith('.ts') || file.endsWith('.test.ts') || file === feature) return false;
        if (file === 'contract.ts' || file === 'index.ts') return false;
        return codeOf(join(srcDir, file)).includes(`from './${feature.slice(0, -3)}.ts'`);
      });
      expect(importers, `${feature} importers`).toEqual(['colladaDecoderFamily.ts']);
    }
  });

  // ★ THE BUNDLE HALF, READ FROM THE HARNESS'S OWN BASELINES. Both are checked: the minified figure is the shipping
  // claim and the unminified one is the tree-shaking signal, and a real saving shows in both.
  it.each(SAVINGS)('saves at least the stated fraction for %s against %s', (subset, full, fraction) => {
    for (const baseline of ['size.baseline.json', 'size.unminified.baseline.json']) {
      const sizes = readBaseline(baseline);
      const subsetBytes = sizes[`${subset}:canvas`];
      const fullBytes = sizes[`${full}:canvas`];
      expect(subsetBytes, `${subset} missing from ${baseline}`).toBeGreaterThan(0);
      expect(fullBytes, `${full} missing from ${baseline}`).toBeGreaterThan(0);
      expect(subsetBytes, `${subset} vs ${full} in ${baseline}`).toBeLessThan(fullBytes * (1 - fraction));
    }
  });

  // The subsets must also order against EACH OTHER: more decoders cannot cost less. This is what catches a fixture
  // that stopped naming what it claims to name, which the inequality against the full family would not.
  it('orders the subsets by how many decoders they name', () => {
    for (const baseline of ['size.baseline.json', 'size.unminified.baseline.json']) {
      const sizes = readBaseline(baseline);
      const geometry = sizes['collada-import-geometry:canvas'];
      const staticScene = sizes['collada-import-static:canvas'];
      const animated = sizes['collada-import-animated:canvas'];
      const full = sizes['collada-import:canvas'];
      expect(geometry, baseline).toBeLessThan(staticScene);
      expect(staticScene, baseline).toBeLessThan(animated);
      expect(animated, baseline).toBeLessThan(full);
    }
  });
});

// A file's CODE, with comment lines stripped. Both the orchestrator and the material decoder NAME the preset in
// prose — one to say why it does not resolve it, the other to explain the ordering — and a scan that read the
// comments would have reported the coupling those comments exist to rule out.
function codeOf(path: string): string {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
    })
    .join('\n');
}

function readBaseline(name: string): Record<string, number> {
  return JSON.parse(readFileSync(join(root, 'tools', 'size', name), 'utf8')) as Record<string, number>;
}
