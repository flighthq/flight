// @vitest-environment node

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

// What an AWD2 block family costs when you do not register it, measured rather than asserted.
//
// The claim is that a block handler is a real import boundary: a build registering geometry, scene
// structure and materials must not have @flighthq/animation, @flighthq/lighting or @flighthq/camera
// anywhere in its module graph — not merely unreferenced in it. That distinction is why the evidence is
// the bundler's own input list, which names every module the graph reaches, rather than a byte count,
// which would shrink for many reasons that are not this one.
//
// Three independent instruments, because each fails differently:
//   1. PACKAGE reachability — no file under packages/<forbidden>/src contributed.
//   2. MODULE reachability — the unregistered handlers' own files contributed zero bytes.
//   3. CONTENT — the handler's own parser is absent, by the name `keepNames` preserves.
// A change that defeated one would have to defeat all three to pass silently.

interface BundleReach {
  code: string;
  contributedBytes: ReadonlyMap<string, number>;
  packages: ReadonlySet<string>;
}

interface BlockFamily {
  module: string;
  name: string;
  // Packages nothing else in a static AWD2 build reaches, so their presence means this family was linked.
  packages: readonly string[];
  // A module-private parser this family owns. Minification renames it, but `keepNames` re-attaches the
  // original as a string, which is what makes the name checkable in a minified bundle at all.
  symbol: string;
  values: readonly string[];
}

const FAMILIES: readonly BlockFamily[] = [
  {
    module: 'awd2SkeletonHandler.ts',
    name: 'skeleton',
    packages: ['animation'],
    symbol: 'parseSkeletonBlock',
    values: ['awd2SkeletonBlockHandler', 'awd2SkeletonPoseHandler', 'awd2SkeletonAnimationHandler'],
  },
  {
    module: 'awd2LightingHandler.ts',
    name: 'lighting',
    packages: ['lighting'],
    symbol: 'parseLightBlock',
    values: ['awd2LightHandler', 'awd2LightPickerHandler'],
  },
  {
    module: 'awd2CameraHandler.ts',
    name: 'camera',
    packages: ['camera'],
    symbol: 'parseCameraBlock',
    values: ['awd2CameraHandler'],
  },
];

// Everything a static scene needs, and nothing else: the build the decomposition exists to serve.
const STATIC_ENTRY = [
  'parseAwd2',
  'awd2TriangleGeometryHandler',
  'awd2ContainerHandler',
  'awd2MeshInstanceHandler',
  'awd2MaterialHandler',
  'awd2TextureHandler',
];

describe('AWD2 static-scene builds', () => {
  it('reaches no animation, lighting or camera package', async () => {
    const bundle = await bundleAwd2Exports(STATIC_ENTRY);
    for (const family of FAMILIES) {
      for (const name of family.packages) {
        expect(bundle.packages.has(name), `${family.name} pulled @flighthq/${name}`).toBe(false);
      }
    }
    // Named outright as well as derived from the table, so the three the task names stay legible here
    // even if the table above is edited.
    expect([...bundle.packages].filter((name) => ['animation', 'lighting', 'camera'].includes(name))).toEqual([]);
  });

  it('links none of the unregistered handler modules', async () => {
    const bundle = await bundleAwd2Exports(STATIC_ENTRY);
    for (const family of FAMILIES) {
      expect(contributedBytes(bundle, family.module), family.name).toBe(0);
      expect(bundle.code.includes(keptFunctionName(family.symbol)), `${family.name} parser`).toBe(false);
    }
  });

  // The one module that names every handler is the only edge by which a build could acquire them all, so
  // an importer that reached it would make every other assertion here depend on tree shaking instead of
  // on the import graph.
  it('does not link the module that names every handler', async () => {
    const bundle = await bundleAwd2Exports(STATIC_ENTRY);
    expect(contributedBytes(bundle, 'awd2BlockRegistry.ts')).toBe(0);
    expect(contributedBytes(bundle, 'awd2BlockDispatch.ts')).toBeGreaterThan(0);
  });

  it('keeps the handlers it did register', async () => {
    const bundle = await bundleAwd2Exports(STATIC_ENTRY);
    for (const module of ['awd2GeometryHandler.ts', 'awd2SceneStructureHandler.ts', 'awd2MaterialHandler.ts']) {
      expect(contributedBytes(bundle, module), module).toBeGreaterThan(0);
    }
  });
});

describe('AWD2 per-family cost', () => {
  for (const family of FAMILIES) {
    // The complement of the exclusion test: each package has to be reachable through its own family, or
    // "absent from the static build" would be a fact about the package rather than about the boundary.
    it(`links the ${family.name} family, and its packages, when it is registered`, async () => {
      const bundle = await bundleAwd2Exports([...STATIC_ENTRY, ...family.values]);
      expect(contributedBytes(bundle, family.module)).toBeGreaterThan(0);
      expect(bundle.code.includes(keptFunctionName(family.symbol)), `${family.name} parser`).toBe(true);
      for (const name of family.packages) expect(bundle.packages.has(name), `@flighthq/${name}`).toBe(true);
    });
  }
});

describe('AWD2 zero-config builds', () => {
  it('reaches every family through the default registry', async () => {
    const bundle = await bundleAwd2Exports(['parseAwd2', 'createAwd2DefaultBlockRegistry']);
    expect(contributedBytes(bundle, 'awd2BlockRegistry.ts')).toBeGreaterThan(0);
    for (const family of FAMILIES) {
      expect(contributedBytes(bundle, family.module), family.name).toBeGreaterThan(0);
      for (const name of family.packages) expect(bundle.packages.has(name), `@flighthq/${name}`).toBe(true);
    }
  });
});

function contributedBytes(bundle: Readonly<BundleReach>, module: string): number {
  return bundle.contributedBytes.get(module) ?? 0;
}

// How `keepNames` records a function's original name once minification has renamed the binding.
function keptFunctionName(symbol: string): string {
  return `,"${symbol}")`;
}

async function bundleAwd2Exports(names: readonly string[]): Promise<BundleReach> {
  const result = await build({
    bundle: true,
    format: 'esm',
    keepNames: true,
    logLevel: 'silent',
    metafile: true,
    minify: true,
    stdin: {
      contents: `export { ${names.join(', ')} } from './index.ts';`,
      resolveDir: getScene3DFormatsSourceDirectory(),
      sourcefile: 'awd2-block-reach.ts',
    },
    treeShaking: true,
    write: false,
  });
  const output = Object.values(result.metafile.outputs)[0];
  const contributedBytes = new Map<string, number>();
  const packages = new Set<string>();
  for (const [file, contribution] of Object.entries(output.inputs)) {
    if (contribution.bytesInOutput <= 0) continue;
    const match = /packages\/([^/]+)\/src\/(.+)$/.exec(file.replaceAll('\\', '/'));
    if (match === null) continue;
    packages.add(match[1]);
    if (match[1] === 'scene3d-formats') contributedBytes.set(match[2], contribution.bytesInOutput);
  }
  return { code: result.outputFiles[0].text, contributedBytes, packages };
}

function getScene3DFormatsSourceDirectory(): string {
  const directory = new URL('../packages/scene3d-formats/src/', import.meta.url);
  const pathname = decodeURIComponent(directory.pathname);
  if (directory.hostname !== '') return `//${directory.hostname}${pathname}`;
  return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
}
