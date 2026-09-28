import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const srcDir = join(root, 'packages', 'scene2d-formats', 'src');

// The document core, and the only local modules it may reach. Everything else in this package's SVG surface is either a
// FEATURE module — an element family or the clip family — or shared plumbing one of them owns.
const CORE = 'svgDocument.ts';
const ALLOWED_LOCAL = new Set(['svgGradient.ts', 'svgRegistry.ts', 'svgStyle.ts', 'svgTransform.ts', 'svgXml.ts']);

// Packages only a feature needs. `@flighthq/clip` is the one this decomposition was ruled on: clipping used to be a step
// in the element walk, so the clip region, the bounding-box measurement and a second reading of the geometry elements and
// of `use` were in every bundle with no configuration able to decline them. `@flighthq/shape` is absent from this list on
// purpose — the core registers the neutral bounds commands a shape needs to measure at all, which is not drawing.
const FEATURE_PACKAGES = [
  '@flighthq/clip',
  '@flighthq/path-formats',
  '@flighthq/text',
  '@flighthq/textlayout',
  '@flighthq/texture',
];

// Each feature module, and the only two modules allowed to name it: the preset that installs its family, and the
// zero-config wrapper that owns the default.
const FEATURE_MODULE_IMPORTERS: readonly (readonly [string, readonly string[]])[] = [
  ['svgClip.ts', ['svgClipHandlers.ts', 'svgImport.ts']],
  ['svgContainerElement.ts', ['svgElementHandlers.ts', 'svgImport.ts']],
  ['svgGeometryElement.ts', ['svgElementHandlers.ts', 'svgImport.ts']],
  ['svgImageElement.ts', ['svgElementHandlers.ts', 'svgImport.ts']],
  ['svgTextElement.ts', ['svgElementHandlers.ts', 'svgImport.ts']],
  ['svgUseElement.ts', ['svgElementHandlers.ts', 'svgImport.ts']],
  // ★ THE BOUNDING BOX BELONGS TO THE CLIP NOW. It is the only consumer — `objectBoundingBox` units are the only thing
  // that needs a box — and while the walk computed one for every element to pass in, `@flighthq/shape`'s bounds
  // machinery was linked by builds that never clipped.
  ['svgBounds.ts', ['svgClip.ts']],
];

// The two family modules that own a full preset, and the arrays they own.
const PRESETS: readonly (readonly [string, string])[] = [
  ['svgAllClipHandlers', 'svgClipHandlers.ts'],
  ['svgAllElementHandlers', 'svgElementHandlers.ts'],
];

const FIXTURES = ['svg-import', 'svg-import-clip', 'svg-import-geometry', 'svg-import-text'] as const;

// What each subset must NOT contain, by the symbol that would appear if it did. Read out of a real bundle rather than out
// of an import list, because an import the bundler shakes is not a cost and an import it keeps is.
//
// `getShapeBounds` is forbidden only in the TEXT subset, and that asymmetry is measured rather than assumed: the geometry
// family records a fill-only box for every shape it draws, because SVG's `objectBoundingBox` units exclude the stroke, so
// geometry carries the shape bounds machinery whether or not anything clips. `registerDefaultShapeBoundsCommands` is in
// every subset for the same reason it is in the core — a shape that cannot measure itself cannot be measured by anything.
const ABSENT_FROM_SUBSET: readonly (readonly [string, readonly string[]])[] = [
  // ★ THE CLIP-FREE SUBSET IS THE RULING'S TEST. No clip region, no bounding-box measurement, and no second reading of
  // `use` — all of which were in this bundle while clipping was a step in the walk.
  [
    'svg-import-geometry',
    [
      'createClipRegionFromPath',
      'intersectClipRegions',
      'unionClipRegions',
      'transformClipRegion',
      'createSvgClipRegion',
      'createSvgNode2DBounds',
      'hasUnmeasurableSvgText',
      'createTextLabel',
      'createTexture',
    ],
  ],
  [
    'svg-import-text',
    [
      'createClipRegionFromPath',
      'createSvgClipRegion',
      'createSvgNode2DBounds',
      'getShapeBounds',
      'appendShapeBeginGradientFill',
      'parseSvgPathData',
      'createTexture',
    ],
  ],
];

// Minimum savings against the zero-config import, set below the WEAKER of the two baselines and far above anything a
// handler shim could produce. Measured, minified / unminified: full 20924 / 38455, clip 17402 / 28051,
// geometry 14408 / 23521, text 10017 / 20639. (The full import grew 5 / 8 bytes when the image family started recording
// its intrinsic box for the clip to read, which is the whole cost of that change.)
const SAVINGS: readonly (readonly [string, number])[] = [
  ['svg-import-geometry', 0.22],
  ['svg-import-text', 0.38],
];

// What registering the clip family costs over the same build without it — the number that would have been zero before
// the ruling, because every build already carried all of it. Measured: 2994 B minified, 4530 B unminified.
const CLIP_FAMILY_MINIMUM_BYTES = 2000;

describe('svg locality', () => {
  // ★ THE STRUCTURAL HALF OF THE CLAIM. A bundle measurement can be satisfied by luck — a bundler that happened to shake
  // something — where this cannot: the core's import list either names a feature or it does not.
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

  // ★ AND A FULL PRESET MUST STAY OFF THE SELECTIVE PATH. `createScene2DFromSvgDocumentWithRegistry` takes the registry
  // as an argument and resolves no default, so the only module that may name a preset is the one that declares it — the
  // zero-config wrapper builds its own entry lists from the handlers directly.
  it.each(PRESETS)('names %s only from %s', (preset, owner) => {
    const owners = svgSources().filter((file) => codeOf(join(srcDir, file)).includes(preset));
    expect(owners).toEqual([owner]);
  });

  it.each(FEATURE_MODULE_IMPORTERS)('gives %s only its declared importers', (module, expected) => {
    const importers = svgSources().filter(
      (file) => file !== module && codeOf(join(srcDir, file)).includes(`from './${module.slice(0, -3)}.ts'`),
    );
    expect(importers.sort()).toEqual([...expected]);
  });

  // ★ AND THE SELECTIVE API HAS TO BE NAMEABLE FROM THE PUBLIC LANE. `types` publishes `SvgRegistry.ts` on both lanes, so
  // an application can name the registry, both kind tables and the handlers it registers — and the fixtures are the
  // end-to-end proof, because esbuild fails the build if any of those names left `.`. They are bundled and never
  // typechecked, so the typed half is the package's own tests under tsc.
  it('prices every subset through the public lane alone', () => {
    const formatsIndex = readFileSync(join(srcDir, 'index.ts'), 'utf8');
    expect(formatsIndex).toContain('createScene2DFromSvgDocumentWithRegistry');
    expect(formatsIndex).toContain('svgPathClipHandler');
    for (const fixture of FIXTURES) {
      const source = readFileSync(join(root, 'tools', 'size', 'fixtures', fixture, 'src', 'render.canvas.ts'), 'utf8');
      expect(codeOfText(source), `${fixture} imports a contract lane`).not.toContain("/contract'");
    }
  });

  // ★ ABSENCE READ OUT OF A REAL BUNDLE, WHICH IS THE ONLY PLACE IT IS TRUE OR FALSE.
  it.each(ABSENT_FROM_SUBSET)('leaves %s free of the code it does not register', async (fixture, symbols) => {
    const code = await bundleFixture(fixture);
    expect(code.length).toBeGreaterThan(1000);
    for (const symbol of symbols) {
      expect(code.includes(symbol), `${fixture} contains ${symbol}`).toBe(false);
    }
  });

  it.each(SAVINGS)('saves at least the stated fraction for %s against the full import', (subset, fraction) => {
    for (const baseline of ['size.baseline.json', 'size.unminified.baseline.json']) {
      const sizes = readBaseline(baseline);
      expect(sizes[`${subset}:canvas`], `${subset} missing from ${baseline}`).toBeGreaterThan(0);
      expect(sizes[`${subset}:canvas`], `${subset} vs svg-import in ${baseline}`).toBeLessThan(
        sizes['svg-import:canvas'] * (1 - fraction),
      );
    }
  });

  // ★ AND THE CLIP FAMILY MUST COST SOMETHING TO REGISTER. The pair differs by one handler, so the byte difference IS
  // clipping — the region, the measurement, the traversal and the clip's own `use` resolution.
  it('charges materially more for the clip family than for the same build without it', () => {
    for (const baseline of ['size.baseline.json', 'size.unminified.baseline.json']) {
      const sizes = readBaseline(baseline);
      const withClip = sizes['svg-import-clip:canvas'];
      const withoutClip = sizes['svg-import-geometry:canvas'];
      expect(withClip, `svg-import-clip missing from ${baseline}`).toBeGreaterThan(0);
      expect(withClip - withoutClip, `clip family cost in ${baseline}`).toBeGreaterThan(CLIP_FAMILY_MINIMUM_BYTES);
      expect(withClip, `svg-import-clip vs the full import in ${baseline}`).toBeLessThan(sizes['svg-import:canvas']);
    }
  });
});

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

// A file's CODE, with comment lines stripped. The core and both presets NAME the things this gate forbids — in prose, to
// record why they do not reach them — and a scan that read the comments would report the very coupling those comments
// exist to rule out.
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

function readBaseline(name: string): Record<string, number> {
  return JSON.parse(readFileSync(join(root, 'tools', 'size', name), 'utf8')) as Record<string, number>;
}

function svgSources(): string[] {
  return readdirSync(srcDir).filter(
    (file) => file.startsWith('svg') && file.endsWith('.ts') && !file.endsWith('.test.ts'),
  );
}
