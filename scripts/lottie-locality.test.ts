import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const srcDir = join(root, 'packages', 'scene2d-formats', 'src');

// The document core, and the only local modules it may reach. Everything else in this package's Lottie surface is a
// FEATURE module — a layer, a shape item, or a paint — and the point of the decomposition is that the core cannot
// reach one.
const CORE = 'lottieDocument.ts';
const ALLOWED_LOCAL = new Set(['lottieBezierPath.ts', 'lottieRegistry.ts']);

// Packages only a feature needs. A document of null layers has no business linking `@flighthq/text`, and the core
// naming any of these is the coupling this file exists to prevent. `@flighthq/clip` is absent from the list on
// purpose: masks belong to no layer kind, so the core reads them for every layer and pays for the clip region.
const FEATURE_PACKAGES = [
  '@flighthq/color',
  '@flighthq/path',
  '@flighthq/shape',
  '@flighthq/text',
  '@flighthq/texture',
];

// The two family modules that own a full preset, and the arrays they own. A module on the selective path naming one of
// these would drag its whole family in.
const PRESETS: readonly (readonly [string, string])[] = [
  ['lottieAllLayerHandlers', 'lottieLayerHandlers.ts'],
  ['lottieAllShapeItemHandlers', 'lottieShapeItemHandlers.ts'],
];

// Each layer module, and the only two modules allowed to name it: the preset that installs the family, and the
// zero-config wrapper that owns the default. Anything else would make omitting a layer fail to omit its code.
const LAYER_MODULES = [
  'lottieImageLayer.ts',
  'lottieNullLayer.ts',
  'lottiePrecompositionLayer.ts',
  'lottieShapeLayer.ts',
  'lottieSolidLayer.ts',
  'lottieTextLayer.ts',
];
const LAYER_IMPORTERS = ['lottieImport.ts', 'lottieLayerHandlers.ts'];

// The fixture pairs that price the boundary, and the minimum saving each must show against the zero-config import.
// Each threshold is set below the WEAKER of the two baselines and far above anything a handler shim could produce — a
// shim moves tens of bytes, and the COLLADA fixtures measured an 18-byte spread across four subsets while they still
// routed through a preset-resolving entry. Measured here: geometry 11477/14330 minified and 20410/30309 unminified,
// null-solid 8886 and 15864, text 7345 and 17630, image 7654 and 13390.
const SAVINGS: readonly (readonly [string, number])[] = [
  ['lottie-import-geometry', 0.12],
  ['lottie-import-null-solid', 0.25],
  ['lottie-import-text', 0.3],
  ['lottie-import-image', 0.35],
];

describe('lottie locality', () => {
  // ★ THE STRUCTURAL HALF OF THE CLAIM. A bundle measurement can be satisfied by luck — a bundler that happened to
  // shake something — where this cannot: the core's import list either names a feature or it does not.
  it('keeps the document core free of every feature module and feature-only package', () => {
    const source = codeOf(join(srcDir, CORE));
    for (const specifier of [...source.matchAll(/from '([^']+)';/g)].map((match) => match[1])) {
      if (!specifier.startsWith('./')) continue;
      expect(ALLOWED_LOCAL.has(specifier.slice(2)), `${CORE} imports ${specifier}`).toBe(true);
    }
    for (const feature of FEATURE_PACKAGES) {
      expect(source.includes(`from '${feature}/contract'`), `${CORE} imports ${feature}`).toBe(false);
    }
  });

  // ★ AND A FULL PRESET MUST STAY OFF THE SELECTIVE PATH. `createScene2DFromLottieDocumentWithRegistry` takes the
  // registry as an argument and resolves no default, so the only module that may name a preset is the one that
  // declares it — the zero-config wrapper builds its own entry lists from the handlers directly.
  it.each(PRESETS)('names %s only from %s', (preset, owner) => {
    const owners = lottieSources().filter((file) => codeOf(join(srcDir, file)).includes(preset));
    expect(owners).toEqual([owner]);
  });

  // Each layer module must be reachable from the preset and the zero-config wrapper and nothing else, which is what
  // makes omitting a layer omit its code. Asserted as "no other module in the package imports it".
  it.each(LAYER_MODULES)('gives %s only the preset and the zero-config wrapper as importers', (module) => {
    const importers = lottieSources().filter(
      (file) => file !== module && codeOf(join(srcDir, file)).includes(`from './${module.slice(0, -3)}.ts'`),
    );
    expect(importers.sort()).toEqual(LAYER_IMPORTERS);
  });

  // ★ THE BUNDLE HALF, READ FROM THE HARNESS'S OWN BASELINES. Both are checked: the minified figure is the shipping
  // claim and the unminified one is the tree-shaking signal, and a real saving shows in both.
  it.each(SAVINGS)('saves at least the stated fraction for %s against the full import', (subset, fraction) => {
    for (const baseline of ['size.baseline.json', 'size.unminified.baseline.json']) {
      const sizes = readBaseline(baseline);
      const subsetBytes = sizes[`${subset}:canvas`];
      const fullBytes = sizes['lottie-import:canvas'];
      expect(subsetBytes, `${subset} missing from ${baseline}`).toBeGreaterThan(0);
      expect(fullBytes, `lottie-import missing from ${baseline}`).toBeGreaterThan(0);
      expect(subsetBytes, `${subset} vs lottie-import in ${baseline}`).toBeLessThan(fullBytes * (1 - fraction));
    }
  });

  // Geometry names four handlers and carries the paint/path render stack, so it must cost more than any subset that
  // names one family. No TOTAL order is asserted: text is the smallest subset minified (7345 B, under image's 7654)
  // and the second largest unminified (17630 B, over image's 13390), because minification compresses the label path
  // far harder than it compresses the sprite path. A chain asserted across both baselines would be false.
  it('costs more for basic geometry than for any single-family subset', () => {
    for (const baseline of ['size.baseline.json', 'size.unminified.baseline.json']) {
      const sizes = readBaseline(baseline);
      for (const subset of ['lottie-import-image', 'lottie-import-null-solid', 'lottie-import-text']) {
        expect(sizes[`${subset}:canvas`], `${subset} in ${baseline}`).toBeLessThan(
          sizes['lottie-import-geometry:canvas'],
        );
      }
      expect(sizes['lottie-import-geometry:canvas'], baseline).toBeLessThan(sizes['lottie-import:canvas']);
    }
  });
});

// A file's CODE, with comment lines stripped. The core and the two presets NAME the things this gate forbids — in
// prose, to record why they do not reach them — and a scan that read the comments would report the very coupling
// those comments exist to rule out.
function codeOf(path: string): string {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
    })
    .join('\n');
}

function lottieSources(): string[] {
  return readdirSync(srcDir).filter(
    (file) =>
      file.startsWith('lottie') &&
      file.endsWith('.ts') &&
      !file.endsWith('.test.ts') &&
      !file.startsWith('lottieTestFixtures'),
  );
}

function readBaseline(name: string): Record<string, number> {
  return JSON.parse(readFileSync(join(root, 'tools', 'size', name), 'utf8')) as Record<string, number>;
}
