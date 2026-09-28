// @vitest-environment node

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

interface BundleReach {
  code: string;
  contributedBytes: ReadonlyMap<string, number>;
  packages: ReadonlySet<string>;
}

interface ChunkFamily {
  module: string;
  name: string;
  packages: readonly string[];
  symbol: string;
  values: readonly string[];
}

const FAMILIES: readonly ChunkFamily[] = [
  {
    module: 'threeDsCameraHandler.ts',
    name: 'camera',
    packages: ['camera'],
    symbol: 'appendThreeDsCameraDocument',
    values: ['threeDsCameraFamily'],
  },
  {
    module: 'threeDsLightHandler.ts',
    name: 'light',
    packages: ['lighting'],
    symbol: 'appendThreeDsLightDocument',
    values: ['threeDsLightFamily'],
  },
  {
    module: 'threeDsKeyframeHandler.ts',
    name: 'keyframe',
    packages: [],
    symbol: 'collectThreeDsNodePivots',
    values: ['threeDsKeyframeFamily'],
  },
];

const STATIC_ENTRY = [
  'buildThreeDsChunkDispatch',
  'parseThreeDsDocumentWithDispatch',
  'threeDsMeshFamily',
  'threeDsMaterialFamily',
];

describe('3DS static-scene builds', () => {
  it('reaches no camera or lighting package', async () => {
    const bundle = await bundleThreeDsExports(STATIC_ENTRY);
    for (const family of FAMILIES) {
      for (const name of family.packages) {
        expect(bundle.packages.has(name), `${family.name} pulled @flighthq/${name}`).toBe(false);
      }
    }
    expect([...bundle.packages].filter((name) => ['camera', 'lighting'].includes(name))).toEqual([]);
  });

  it('links none of the unregistered handler modules', async () => {
    const bundle = await bundleThreeDsExports(STATIC_ENTRY);
    for (const family of FAMILIES) {
      expect(contributedBytes(bundle, family.module), family.name).toBe(0);
      expect(bundle.code.includes(keptFunctionName(family.symbol)), `${family.name} parser`).toBe(false);
    }
  });

  it('does not link the module that names every handler', async () => {
    const bundle = await bundleThreeDsExports(STATIC_ENTRY);
    expect(contributedBytes(bundle, 'threeDsChunkRegistry.ts')).toBe(0);
    expect(contributedBytes(bundle, 'threeDsChunkDispatch.ts')).toBeGreaterThan(0);
  });

  it('keeps the handlers it did register', async () => {
    const bundle = await bundleThreeDsExports(STATIC_ENTRY);
    for (const module of ['threeDsMeshHandler.ts', 'threeDsMaterialHandler.ts']) {
      expect(contributedBytes(bundle, module), module).toBeGreaterThan(0);
    }
  });
});

describe('3DS per-family cost', () => {
  for (const family of FAMILIES) {
    it(`links the ${family.name} family, and its packages, when it is registered`, async () => {
      const bundle = await bundleThreeDsExports([...STATIC_ENTRY, ...family.values]);
      expect(contributedBytes(bundle, family.module)).toBeGreaterThan(0);
      expect(bundle.code.includes(keptFunctionName(family.symbol)), `${family.name} parser`).toBe(true);
      for (const name of family.packages) expect(bundle.packages.has(name), `@flighthq/${name}`).toBe(true);
    });
  }
});

describe('3DS zero-config builds', () => {
  it('reaches every family through the all-handlers preset', async () => {
    const bundle = await bundleThreeDsExports(['parse3ds', 'threeDsAllChunkHandlers']);
    expect(contributedBytes(bundle, 'threeDsChunkRegistry.ts')).toBeGreaterThan(0);
    for (const family of FAMILIES) {
      expect(contributedBytes(bundle, family.module), family.name).toBeGreaterThan(0);
      for (const name of family.packages) expect(bundle.packages.has(name), `@flighthq/${name}`).toBe(true);
    }
  });
});

function contributedBytes(bundle: Readonly<BundleReach>, module: string): number {
  return bundle.contributedBytes.get(module) ?? 0;
}

function keptFunctionName(symbol: string): string {
  return `,"${symbol}")`;
}

async function bundleThreeDsExports(names: readonly string[]): Promise<BundleReach> {
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
      sourcefile: '3ds-chunk-reach.ts',
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
