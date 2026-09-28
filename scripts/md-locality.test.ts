import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const srcDir = join(root, 'packages', 'scene3d-formats', 'src');

// The two selective cores. Each takes the section handlers it is given and resolves no default, so naming a family — or
// the preset — here would put every family into the module graph of every caller.
const CORES = ['md5Parse.ts', 'md2Parse.ts'];

// One marker per family: a symbol that exists ONLY if that family's interpretation was linked.
//
// ★ NOT `parseMd5Mesh` OR `parseMd2`. Both are substrings of the selective entry points
// (`parseMd5MeshWithSectionHandlers`, `parseMd2WithSectionHandlers`), so a presence check on either is satisfied by the
// entry point every fixture calls and would read as the zero-config wrapper being linked everywhere.
const FAMILY_MARKERS: Readonly<Record<string, string>> = {
  md2Animation: 'buildMd2MorphAnimations',
  md2AnimationDependency: 'createAnimationTrack',
  md2Skin: 'md2SkinHandler',
  md2SkinDiagnostic: 'md2.skin-empty-path',
  md5Material: 'md5MaterialHandler',
  md5Skeleton: 'buildMd5SkeletonDocument',
  md5SkeletonCycleCheck: 'isMd5JointCycle',
  md5SkeletonDiagnostic: 'md5mesh.joint-parent-out-of-range',
  materialDependency: 'createBlinnPhongMaterial',
};

// Each subset, and exactly which markers may appear in its bundle. Everything else in the table above must be ABSENT.
const SUBSET_MARKERS: readonly (readonly [string, readonly string[]])[] = [
  ['md5-import-geometry', []],
  ['md5-import-skeleton', ['md5Skeleton', 'md5SkeletonCycleCheck', 'md5SkeletonDiagnostic']],
  ['md5-import-material', ['md5Material', 'materialDependency']],
  ['md2-import-geometry', []],
  ['md2-import-skin', ['md2Skin', 'md2SkinDiagnostic', 'materialDependency']],
  ['md2-import-animation', ['md2Animation', 'md2AnimationDependency']],
];

// Minimum saving each subset must show against its format's full preset, set below the WEAKER of the two baselines.
//
// Measured, minified / unminified gzip: md5-import 7693 / 13190, md5-import-skeleton 6845 / 11391,
// md5-import-material 5538 / 10769, md5-import-geometry 4740 / 9016, md2-import 4440 / 7827,
// md2-import-skin 4041 / 7082, md2-import-animation 3157 / 5917, md2-import-geometry 2728 / 5162.
const SAVINGS: readonly (readonly [string, string, number])[] = [
  ['md5-import-geometry', 'md5-import', 0.25],
  ['md5-import-material', 'md5-import', 0.15],
  ['md5-import-skeleton', 'md5-import', 0.08],
  ['md2-import-geometry', 'md2-import', 0.28],
  ['md2-import-animation', 'md2-import', 0.18],
  ['md2-import-skin', 'md2-import', 0.06],
];

describe('md locality', () => {
  // ★ THE SKELETON BUILDER LIVES WITH ITS HANDLER, NOT IN THE PARSER. `buildMd5SkeletonDocument` and the cycle check it
  // needs were retained in `md5Parse.ts` while `md5SkeletonHandler` was a one-line call into them, which made the handler
  // a shim over 170 lines of skeleton interpretation held by the module every MD5 caller parses through: declining the
  // skeleton family removed the registration and none of the work.
  it('keeps skeleton interpretation out of the MD5 parser', () => {
    const parser = codeOf(join(srcDir, 'md5Parse.ts'));
    expect(parser).not.toContain('buildMd5SkeletonDocument');
    expect(parser).not.toContain('isMd5JointCycle');
    expect(codeOf(join(srcDir, 'md5SkeletonHandler.ts'))).toContain('function buildMd5SkeletonDocument');
  });

  // ★ AND NEITHER CORE NAMES A FAMILY OR THE PRESET. The parsers are the preset-free selective cores; the zero-config
  // wrappers that resolve a default live in `md5Document.ts` and `md2Document.ts`.
  it.each(CORES)('keeps %s free of every family and of the preset', (core) => {
    const source = codeOf(join(srcDir, core));
    expect(source).not.toContain('SectionRegistry');
    expect(source.match(/md[25]\w*Family/g)).toBeNull();
    expect(source.match(/md[25]AllSectionHandlers/g)).toBeNull();
  });

  // ★ EACH FAMILY CONSTANT IS DECLARED BESIDE THE HANDLER IT NAMES. All four sat in the two registry modules next to the
  // presets, so naming ONE family imported the registry and linked the OTHER family's handler with it. What that cost is
  // now the gap between a subset and its preset: an MD5 caller naming the skeleton family avoids 8,387 raw bytes of
  // material reader and `@flighthq/materials` (65,331 → 56,944), and an MD2 caller naming the animation family avoids
  // 9,473 (35,754 → 26,281). A family constant is one element long; where it is declared is the whole of what naming it
  // costs.
  it.each([
    ['md5SkeletonFamily', 'md5SkeletonHandler.ts'],
    ['md5MaterialFamily', 'md5MaterialHandler.ts'],
    ['md2SkinFamily', 'md2SkinHandler.ts'],
    ['md2AnimationFamily', 'md2AnimationHandler.ts'],
  ])('declares %s beside its handler', (family, owner) => {
    expect(codeOf(join(srcDir, owner))).toContain(`export const ${family}`);
  });

  // The registry modules are the presets and nothing else: one export each, so importing one means asking for everything.
  it.each(['md5SectionRegistry.ts', 'md2SectionRegistry.ts'])('reduces %s to the preset alone', (registry) => {
    const exports = codeOf(join(srcDir, registry)).match(/^export /gm);
    expect(exports).toHaveLength(1);
    expect(codeOf(join(srcDir, registry))).toMatch(/export const md[25]AllSectionHandlers/);
  });

  // ★ ABSENCE READ OUT OF A REAL BUNDLE, WHICH IS THE ONLY PLACE IT IS TRUE OR FALSE. A structural import check says what
  // a module names; this says what survives, family by family, for every subset at once.
  it.each(SUBSET_MARKERS)('links only its own families in %s', async (fixture, allowed) => {
    const code = await bundleFixture(fixture);
    expect(code.length).toBeGreaterThan(1000);
    for (const [family, marker] of Object.entries(FAMILY_MARKERS)) {
      expect(code.includes(marker), `${fixture} ${allowed.includes(family) ? 'lost' : 'links'} ${family}`).toBe(
        allowed.includes(family),
      );
    }
  });

  // And the full preset carries every marker, so the absences above are a consequence of declining a family rather than
  // of the marker never being reachable at all.
  it.each([
    ['md5-import', ['md5Skeleton', 'md5SkeletonCycleCheck', 'md5SkeletonDiagnostic', 'md5Material']],
    ['md2-import', ['md2Animation', 'md2AnimationDependency', 'md2Skin', 'md2SkinDiagnostic']],
  ] as const)('links every family of its format in %s', async (fixture, families) => {
    const code = await bundleFixture(fixture);
    for (const family of families) expect(code, `${fixture} lost ${family}`).toContain(FAMILY_MARKERS[family]);
  });

  it.each(SAVINGS)('saves at least the stated fraction for %s against %s', (subset, full, fraction) => {
    for (const baseline of ['size.baseline.json', 'size.unminified.baseline.json']) {
      const sizes = readBaseline(baseline);
      expect(sizes[`${subset}:canvas`], `${subset} missing from ${baseline}`).toBeGreaterThan(0);
      expect(sizes[`${subset}:canvas`], `${subset} vs ${full} in ${baseline}`).toBeLessThan(
        sizes[`${full}:canvas`] * (1 - fraction),
      );
    }
  });

  // Registering a family must cost more than declining it — the ordering that makes the numbers above meaningful rather
  // than a coincidence of thresholds.
  it.each([
    ['md5-import', 'md5-import-geometry', ['md5-import-skeleton', 'md5-import-material']],
    ['md2-import', 'md2-import-geometry', ['md2-import-skin', 'md2-import-animation']],
  ] as const)('charges more for every %s family than for the no-family floor', (full, floorFixture, subsets) => {
    for (const baseline of ['size.baseline.json', 'size.unminified.baseline.json']) {
      const sizes = readBaseline(baseline);
      const floor = sizes[`${floorFixture}:canvas`];
      expect(floor, `${floorFixture} missing from ${baseline}`).toBeGreaterThan(0);
      for (const subset of subsets) {
        expect(sizes[`${subset}:canvas`], `${subset} vs the floor in ${baseline}`).toBeGreaterThan(floor);
        expect(sizes[`${full}:canvas`], `${full} vs ${subset} in ${baseline}`).toBeGreaterThan(
          sizes[`${subset}:canvas`],
        );
      }
    }
  });
});

// Each fixture is bundled once and shared: eight fixtures read by two assertions is sixteen esbuild runs if each asks for
// its own, and this file runs alongside the rest of `test:scripts`, where the added CPU is enough to starve a
// neighbouring suite's hook budget.
const bundles = new Map<string, Promise<string>>();

function bundleFixture(fixture: string): Promise<string> {
  const cached = bundles.get(fixture);
  if (cached !== undefined) return cached;
  const pending = build({
    bundle: true,
    entryPoints: [join(root, 'tools', 'size', 'fixtures', fixture, 'src', 'render.canvas.ts')],
    format: 'esm',
    keepNames: true,
    logLevel: 'error',
    write: false,
  }).then((result) => result.outputFiles[0].text);
  bundles.set(fixture, pending);
  return pending;
}

// A file's CODE, with comment lines stripped. The headers here discuss the families and the preset a core must not reach,
// and a scan that read them would report the very coupling those comments exist to rule out.
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
