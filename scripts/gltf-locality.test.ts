import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const srcDir = join(root, 'packages', 'scene3d-formats', 'src');

// The selective core. It parses with the core-feature handler list it is GIVEN and resolves no default, so
// naming a registrar here — or the preset — would put those families into the module graph of every caller.
const CORE = 'gltfParse.ts';

// One marker per family: a symbol or literal that exists ONLY if that family's interpretation was linked.
// Diagnostics and extension identifiers, not registrar names — a registrar shim is a few hundred bytes and
// proves nothing about what it reaches.
const FAMILY_MARKERS: Readonly<Record<string, string>> = {
  animations: 'gltf.animation-target-unresolved',
  cameras: 'gltf.camera-invalid-perspective',
  lightingDependency: 'createDirectionalLight',
  lightingExtension: 'KHR_lights_punctual',
  materialExtension: 'KHR_materials_anisotropy',
  materialExtensionSpecularGlossiness: 'KHR_materials_pbrSpecularGlossiness',
  materialExtensionUnlit: 'KHR_materials_unlit',
  skins: 'gltf.skin-ibm-count-mismatch',
};

// Each subset, and exactly which markers may appear in its bundle. Everything else in the table above must be
// ABSENT.
//
// ★ `gltf-import` IS THE ZERO-CONFIG PARSER AND CARRIES THE THREE CORE FAMILIES BUT NO EXTENSION. That split is
// the design, not an omission: a glTF file's optional core sections are part of reading the format, while an
// extension reinterprets a material a base parse already imported. The material-extension family alone measures
// more than the three core families together, which is why it waits for `registerAllGltfHandlers`.
const SUBSET_MARKERS: readonly (readonly [string, readonly string[]])[] = [
  ['gltf-import-core', []],
  ['gltf-import-animations', ['animations']],
  ['gltf-import-cameras', ['cameras']],
  ['gltf-import-skins', ['skins']],
  [
    'gltf-import-material-extensions',
    ['materialExtension', 'materialExtensionSpecularGlossiness', 'materialExtensionUnlit'],
  ],
  ['gltf-import-lighting-extension', ['lightingExtension', 'lightingDependency']],
  ['gltf-import', ['animations', 'cameras', 'skins']],
];

// Minimum saving each subset must show against the everything-registered import, set below the WEAKER of the
// two baselines.
//
// Measured, minified / unminified gzip: gltf-import-all 13253 / 24313, gltf-import-material-extensions
// 11059 / 20317, gltf-import 10681 / 19785, gltf-import-lighting-extension 10375 / 19080,
// gltf-import-animations 10078 / 18719, gltf-import-cameras 9653 / 18042, gltf-import-skins 9533 / 17871,
// gltf-import-core 9258 / 17259.
const SAVINGS: readonly (readonly [string, number])[] = [
  ['gltf-import-core', 0.25],
  ['gltf-import-skins', 0.22],
  ['gltf-import-cameras', 0.22],
  ['gltf-import-animations', 0.19],
  ['gltf-import-lighting-extension', 0.17],
  ['gltf-import', 0.14],
  ['gltf-import-material-extensions', 0.13],
];

describe('gltf locality', () => {
  // ★ THE AUDIT'S ONE REAL FINDING, AND THIS IS ITS REGRESSION GUARD. `gltfParse.ts` declared the zero-config
  // `parseGltf` / `parseGlb` / `createScene3D*` wrappers, and with them a `getFullGltfCoreFeatureHandlers` that
  // named the animation, camera and skin registrars — so the module holding `parseGltfWithCoreFeatureHandlers`,
  // whose entire purpose is taking the list it is given, named three families. esbuild shook the reference out
  // (`gltf-import-core` measured 83,141 raw bytes either way and carried no family marker), so it cost nothing;
  // but a source-level claim cannot be gated while it is false, and the reference was one reachable edge from
  // charging every caller. The wrappers now live in `gltfImport.ts`.
  it('keeps the selective core free of every registrar and of the preset', () => {
    const source = codeOf(join(srcDir, CORE));
    expect(source).not.toContain('registerAllGltfHandlers');
    expect(source.match(/registerGltf\w+Handlers/g)).toBeNull();
    expect(source).not.toContain('getFullGltfCoreFeatureHandlers');
  });

  // ★ AND THE PRESET IS NAMED BY EXACTLY ONE MODULE. `gltfImport.ts` deliberately is NOT that module: it
  // resolves the three CORE registrars itself rather than calling the preset, because the preset also installs
  // both extension families, which a zero-config glTF parse does not import.
  it('names the preset only from the module that declares it', () => {
    const owners = gltfSources().filter((file) => codeOf(join(srcDir, file)).includes('registerAllGltfHandlers'));
    expect(owners).toEqual(['registerAllGltfHandlers.ts']);
  });

  // The zero-config wrapper is the only other module allowed to resolve a family for the caller; everything
  // else must take the list it is handed.
  it.each(['registerGltfAnimationHandlers', 'registerGltfCameraHandlers', 'registerGltfSkinHandlers'])(
    'names %s only from its own module, the preset, and the zero-config wrapper',
    (registrar) => {
      const owners = gltfSources().filter((file) => codeOf(join(srcDir, file)).includes(registrar));
      expect(owners.sort()).toEqual([`${registrar}.ts`, 'gltfImport.ts', 'registerAllGltfHandlers.ts'].sort());
    },
  );

  // ★ ABSENCE READ OUT OF A REAL BUNDLE, WHICH IS THE ONLY PLACE IT IS TRUE OR FALSE. The colocated
  // `gltfTreeShaking.test.ts` bundles one export name per case with `packages: 'external'`, so its assertions
  // are about the SOURCE GRAPH and its `@flighthq/lighting` check reads an import specifier rather than linked
  // code. This bundles the production fixtures with dependencies inlined, which is what a caller ships.
  it.each(SUBSET_MARKERS)('links only its own families in %s', async (fixture, allowed) => {
    const code = await bundleFixture(fixture);
    expect(code.length).toBeGreaterThan(1000);
    for (const [family, marker] of Object.entries(FAMILY_MARKERS)) {
      expect(code.includes(marker), `${fixture} ${allowed.includes(family) ? 'lost' : 'links'} ${family}`).toBe(
        allowed.includes(family),
      );
    }
  });

  // And everything-registered carries every marker, so each absence above is a consequence of declining a
  // family rather than of the marker never being reachable at all.
  it('links every family in gltf-import-all', async () => {
    const code = await bundleFixture('gltf-import-all');
    for (const [family, marker] of Object.entries(FAMILY_MARKERS)) {
      expect(code.includes(marker), `gltf-import-all lost ${family}`).toBe(true);
    }
  });

  it.each(SAVINGS)('saves at least the stated fraction for %s against gltf-import-all', (subset, fraction) => {
    for (const baseline of ['size.baseline.json', 'size.unminified.baseline.json']) {
      const sizes = readBaseline(baseline);
      expect(sizes[`${subset}:canvas`], `${subset} missing from ${baseline}`).toBeGreaterThan(0);
      expect(sizes[`${subset}:canvas`], `${subset} vs gltf-import-all in ${baseline}`).toBeLessThan(
        sizes['gltf-import-all:canvas'] * (1 - fraction),
      );
    }
  });

  // Registering a family must cost more than declining it — the ordering that makes the numbers above
  // meaningful rather than a coincidence of thresholds.
  it('charges more for every family than for the no-family floor', () => {
    for (const baseline of ['size.baseline.json', 'size.unminified.baseline.json']) {
      const sizes = readBaseline(baseline);
      const floor = sizes['gltf-import-core:canvas'];
      expect(floor, `gltf-import-core missing from ${baseline}`).toBeGreaterThan(0);
      for (const [subset] of SUBSET_MARKERS) {
        if (subset === 'gltf-import-core') continue;
        expect(sizes[`${subset}:canvas`], `${subset} vs the floor in ${baseline}`).toBeGreaterThan(floor);
      }
      expect(sizes['gltf-import-all:canvas'], baseline).toBeGreaterThan(sizes['gltf-import:canvas']);
    }
  });
});

// Each fixture is bundled once and shared: eight fixtures read by two assertions is sixteen esbuild runs if
// each asks for its own, and this file runs alongside the rest of `test:scripts`, where the added CPU is enough
// to starve a neighbouring suite's hook budget.
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

// A file's CODE, with comment lines stripped. `gltfImport.ts`'s header discusses the preset it deliberately
// does not call, and a scan that read it would report the very coupling that comment exists to rule out.
function codeOf(path: string): string {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
    })
    .join('\n');
}

function gltfSources(): string[] {
  return readdirSync(srcDir).filter(
    (file) =>
      (file.startsWith('gltf') || file.startsWith('registerGltf') || file.startsWith('registerAllGltf')) &&
      file.endsWith('.ts') &&
      !file.endsWith('.test.ts'),
  );
}

function readBaseline(name: string): Record<string, number> {
  return JSON.parse(readFileSync(join(root, 'tools', 'size', name), 'utf8')) as Record<string, number>;
}
