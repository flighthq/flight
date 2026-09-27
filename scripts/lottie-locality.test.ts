import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  createScene2DFromLottieDocumentWithRegistry,
  lottieAdditiveMaskHandler,
  lottieShapeLayerHandler,
} from '@flighthq/scene2d-formats';
import type { LottieDocument, LottieRegistry } from '@flighthq/types';
import { LottieLayerKind, LottieMaskKind } from '@flighthq/types';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const srcDir = join(root, 'packages', 'scene2d-formats', 'src');

// The document core, and the only local modules it may reach. Everything else in this package's Lottie surface is a
// FEATURE module — a layer, a shape item, or a paint — and the point of the decomposition is that the core cannot
// reach one.
const CORE = 'lottieDocument.ts';
const ALLOWED_LOCAL = new Set(['lottieRegistry.ts']);

// Packages only a feature needs. A document of null layers has no business linking `@flighthq/text`, and the core
// naming any of these is the coupling this file exists to prevent. `@flighthq/clip` joined the list when masks became a
// family of their own: the core used to read `masksProperties` for every layer, so a null-layer-only import paid for
// the clip region and the bezier path reader behind it.
const FEATURE_PACKAGES = [
  '@flighthq/clip',
  '@flighthq/color',
  '@flighthq/path',
  '@flighthq/shape',
  '@flighthq/text',
  '@flighthq/texture',
];

// What each subset must NOT contain, by the symbol that would appear if it did. Read out of a real bundle rather than
// out of an import list, because an import the bundler shakes is not a cost and an import it keeps is.
const ABSENT_FROM_SUBSET: readonly (readonly [string, readonly string[]])[] = [
  [
    'lottie-import-null-solid',
    ['createClipRegionFromPath', 'createLottieBezierPath', 'createTextLabel', 'createTexture'],
  ],
  [
    'lottie-import-image',
    ['createClipRegionFromPath', 'createLottieBezierPath', 'createTextLabel', 'appendShapeBeginFill'],
  ],
  [
    'lottie-import-text',
    ['createClipRegionFromPath', 'createLottieBezierPath', 'createTexture', 'appendShapeBeginFill'],
  ],
  // ★ THE SOLID-FILL-ONLY SHAPE BUILD. It registers the shape layer with the ellipse, fill and rectangle items, so it
  // draws — and must contain no gradient builder, no gradient matrix, no stop decoder and not even the solid LINE style,
  // because it registered no stroke. Every one of these was in this bundle while the shape layer switched on
  // `paint.kind`, since the switch named all four branches whatever the caller registered.
  [
    'lottie-import-geometry',
    [
      'appendShapeBeginGradientFill',
      'appendShapeLineGradientStyle',
      'appendShapeLineStyle',
      'createLottieGradientMatrix',
      'parseLottieGradient',
    ],
  ],
];

// Each paint family, priced against the solid-fill-only build that differs from it by exactly that one family, and the
// minimum each must cost. A handler shim moves tens of bytes; these move hundreds, which is the difference between
// registering a family and merely naming it.
//
// Measured against geometry (10174 minified / 18312 unminified): stroke 10586 / 18875, gradient fill 11090 / 19802,
// gradient stroke 11207 / 20019 — so declining one saves 412-1033 B minified and 563-1707 B unminified.
const PAINT_FAMILY_COST: readonly (readonly [string, number])[] = [
  ['lottie-import-stroke', 250],
  ['lottie-import-gradient-fill', 600],
  ['lottie-import-gradient-stroke', 700],
];

// The three family modules that own a full preset, and the arrays they own. A module on the selective path naming one of
// these would drag its whole family in.
const PRESETS: readonly (readonly [string, string])[] = [
  ['lottieAllLayerHandlers', 'lottieLayerHandlers.ts'],
  ['lottieAllMaskHandlers', 'lottieMaskHandlers.ts'],
  ['lottieAllShapeItemHandlers', 'lottieShapeItemHandlers.ts'],
];

// Each layer module, and the only two modules allowed to name it: the preset that installs the family, and the
// zero-config wrapper that owns the default. Anything else would make omitting a layer fail to omit its code.
const FEATURE_MODULE_IMPORTERS: readonly (readonly [string, readonly string[]])[] = [
  ['lottieImageLayer.ts', ['lottieImport.ts', 'lottieLayerHandlers.ts']],
  ['lottieMask.ts', ['lottieImport.ts', 'lottieMaskHandlers.ts']],
  ['lottieNullLayer.ts', ['lottieImport.ts', 'lottieLayerHandlers.ts']],
  ['lottiePrecompositionLayer.ts', ['lottieImport.ts', 'lottieLayerHandlers.ts']],
  ['lottieShapeLayer.ts', ['lottieImport.ts', 'lottieLayerHandlers.ts']],
  ['lottieSolidLayer.ts', ['lottieImport.ts', 'lottieLayerHandlers.ts']],
  ['lottieTextLayer.ts', ['lottieImport.ts', 'lottieLayerHandlers.ts']],
];

// The fixture pairs that price the boundary, and the minimum saving each must show against the zero-config import.
// Each threshold is set below the WEAKER of the two baselines and far above anything a handler shim could produce — a
// shim moves tens of bytes, and the COLLADA fixtures measured an 18-byte spread across four subsets while they still
// routed through a preset-resolving entry.
//
// Measured, minified / unminified: full 14456 / 30672, geometry 10174 / 18312, null-solid 7735 / 13918,
// image 6458 / 11282, text 6140 / 15512.
//
// Two extractions moved these. Making masks a family of their own took more than a kilobyte off every subset — image
// -1199 / -2106, text -1206 / -2161, null-solid -1139 / -1985 — and giving each paint its own painter took a further
// 693 / 1228 off the solid-fill-only build. The full import grew both times, 99 / 253 then 44 / 168, for the extra
// registry field and the indirection. That is the shape a real extraction has: the callers who decline a feature stop
// paying for it, and the caller who wants everything pays a little more for being asked.
const FIXTURES = [
  'lottie-import',
  'lottie-import-geometry',
  'lottie-import-gradient-fill',
  'lottie-import-gradient-stroke',
  'lottie-import-image',
  'lottie-import-null-solid',
  'lottie-import-stroke',
  'lottie-import-text',
] as const;

const SAVINGS: readonly (readonly [string, number])[] = [
  ['lottie-import-geometry', 0.22],
  ['lottie-import-null-solid', 0.35],
  ['lottie-import-text', 0.4],
  ['lottie-import-image', 0.45],
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

  // Each feature module must be reachable from its own preset and the zero-config wrapper and nothing else, which is
  // what makes omitting a family omit its code. Asserted as "no other module in the package imports it". The mask
  // module is in this table for the same reason the layers are: while the core called its reading directly, there was
  // no configuration in which a caller could leave it out.
  it.each(FEATURE_MODULE_IMPORTERS)(
    'gives %s only its preset and the zero-config wrapper as importers',
    (module, expected) => {
      const importers = lottieSources().filter(
        (file) => file !== module && codeOf(join(srcDir, file)).includes(`from './${module.slice(0, -3)}.ts'`),
      );
      expect(importers.sort()).toEqual([...expected]);
    },
  );

  // ★ THE SELECTIVE API HAS TO BE NAMEABLE, NOT JUST PRESENT. `LottieRegistry.ts` holds the registry, both handler
  // entry types and both `*Kind` tables; while `types` published it on `./contract` only, `layerHandlers` was a public
  // option with a private element type and no application could call the selective entry at all. The fixtures are the
  // end-to-end proof — they name the entry, the handlers and a kind table from `.` alone — so the assertion that they
  // reach for no contract lane is the assertion that the public lane is complete.
  it('publishes the registry types and the selective entry on both lanes, and prices them through the public one', () => {
    const typesIndex = readFileSync(join(root, 'packages', 'types', 'src', 'index.ts'), 'utf8');
    const typesContract = readFileSync(join(root, 'packages', 'types', 'src', 'contract.ts'), 'utf8');
    for (const lane of [typesIndex, typesContract]) expect(lane).toContain("export * from './LottieRegistry.ts';");

    const formatsIndex = readFileSync(join(srcDir, 'index.ts'), 'utf8');
    expect(formatsIndex).toContain('createScene2DFromLottieDocumentWithRegistry');

    for (const fixture of FIXTURES) {
      const source = readFileSync(join(root, 'tools', 'size', 'fixtures', fixture, 'src', 'render.canvas.ts'), 'utf8');
      expect(codeOfText(source), `${fixture} imports a contract lane`).not.toContain("/contract'");
    }
  });

  // ★ AND THE TYPES HAVE TO BE SATISFIABLE, NOT ONLY THE NAMES. The fixtures are bundled, never typechecked, so they
  // prove every name resolves on `.` and nothing more. This is the other half: a `LottieRegistry` written the way a
  // caller has to write one, out of `@flighthq/types`' public lane, under tsc. It lives in `scripts/` because a package
  // may not import a public lane — intra-SDK imports resolve to `/contract` — so no test inside `scene2d-formats` can
  // make this claim at all.
  it('lets an application drive the selective entry from the public lanes alone', () => {
    const registry: LottieRegistry = {
      layerHandlers: [{ handle: lottieShapeLayerHandler, kind: LottieLayerKind.Shape }],
      maskHandlers: [{ handle: lottieAdditiveMaskHandler, kind: LottieMaskKind.Additive }],
      shapeItemHandlers: [],
    };
    const document: LottieDocument = { fr: 30, h: 100, ip: 0, layers: [PUBLIC_LANE_LAYER], op: 60, w: 100 };
    const result = createScene2DFromLottieDocumentWithRegistry(document, registry);
    expect(result.duration).toBe(2);
    expect(result.root).not.toBeNull();
  });

  // ★ ABSENCE READ OUT OF A REAL BUNDLE, WHICH IS THE ONLY PLACE IT IS TRUE OR FALSE. A structural import check says
  // what a module names; this says what survives. Masks are the reason it exists: while the walk read
  // `masksProperties` for every layer, `@flighthq/clip` and the bezier path reader were in a null-layer-only build, and
  // no import list would have called that a defect because the core legitimately named them.
  it.each(ABSENT_FROM_SUBSET)('leaves %s free of the code it does not register', async (fixture, symbols) => {
    const code = await bundleFixture(fixture);
    expect(code.length).toBeGreaterThan(1000);
    for (const symbol of symbols) {
      expect(code.includes(symbol), `${fixture} contains ${symbol}`).toBe(false);
    }
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

  // ★ AND EACH PAINT FAMILY MUST COST SOMETHING TO REGISTER. The pair differs by one item handler, so the byte
  // difference IS that family's drawing code. This is the assertion the old `switch (paint.kind)` would have failed:
  // with every builder already linked by the layer, adding a handler moved only the handler.
  it.each(PAINT_FAMILY_COST)('charges materially more than solid fill alone for %s', (fixture, minimum) => {
    for (const baseline of ['size.baseline.json', 'size.unminified.baseline.json']) {
      const sizes = readBaseline(baseline);
      const withFamily = sizes[`${fixture}:canvas`];
      const solidFillOnly = sizes['lottie-import-geometry:canvas'];
      expect(withFamily, `${fixture} missing from ${baseline}`).toBeGreaterThan(0);
      expect(withFamily - solidFillOnly, `${fixture} over geometry in ${baseline}`).toBeGreaterThan(minimum);
      expect(withFamily, `${fixture} vs the full import in ${baseline}`).toBeLessThan(sizes['lottie-import:canvas']);
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
  return codeOfText(readFileSync(path, 'utf8'));
}

function codeOfText(source: string): string {
  return source
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

// One masked shape layer: enough to exercise both families the registry above names.
const PUBLIC_LANE_LAYER = {
  ind: 1,
  ip: 0,
  masksProperties: [
    {
      mode: 'a' as const,
      o: { k: 100 },
      pt: {
        k: {
          c: true,
          i: [[0, 0]],
          o: [[0, 0]],
          v: [[0, 0]],
        },
      },
    },
  ],
  nm: 'public',
  op: 60,
  shapes: [
    { p: { k: [5, 5] }, r: { k: 0 }, s: { k: [10, 10] }, ty: 'rc' as const },
    { c: { k: [1, 0, 0] }, o: { k: 100 }, ty: 'fl' as const },
  ],
  ty: 4,
};

async function bundleFixture(fixture: string): Promise<string> {
  const result = await build({
    bundle: true,
    entryPoints: [join(root, 'tools', 'size', 'fixtures', fixture, 'src', 'render.canvas.ts')],
    format: 'esm',
    keepNames: true,
    logLevel: 'error',
    write: false,
  });
  return result.outputFiles[0].text;
}

function readBaseline(name: string): Record<string, number> {
  return JSON.parse(readFileSync(join(root, 'tools', 'size', name), 'utf8')) as Record<string, number>;
}
