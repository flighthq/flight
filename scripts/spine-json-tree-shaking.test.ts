// @vitest-environment node

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

interface BundleReach {
  code: string;
  contributedBytes: ReadonlyMap<string, number>;
  packages: ReadonlySet<string>;
}

interface HandlerFamily {
  handler: string;
  module: string;
  name: string;
  packages: readonly string[];
}

const SECTION_FAMILIES: readonly HandlerFamily[] = [
  {
    handler: 'spineJsonAnimationsSectionHandler',
    module: 'spineJsonAnimationsHandler.ts',
    name: 'animations',
    packages: ['animation'],
  },
  {
    handler: 'spineJsonSkinsSectionHandler',
    module: 'spineJsonSkinsHandler.ts',
    name: 'skins',
    packages: ['entity', 'skeleton2d'],
  },
];

const TIMELINE_FAMILIES: readonly HandlerFamily[] = [
  {
    handler: 'spineJsonBoneTimelineHandler',
    module: 'spineJsonBoneTimelineHandler.ts',
    name: 'bone timeline',
    packages: ['animation', 'skeleton2d'],
  },
  {
    handler: 'spineJsonSlotTimelineHandler',
    module: 'spineJsonSlotTimelineHandler.ts',
    name: 'slot timeline',
    packages: ['animation', 'skeleton2d'],
  },
];

const ALL_FAMILIES = [...SECTION_FAMILIES, ...TIMELINE_FAMILIES];

const BONES_ONLY_ENTRY = [
  'createSpineJsonRegistry',
  'registerSpineJsonSectionHandler',
  'parseSpineSkeletonWithRegistry',
  'spineJsonBonesSectionHandler',
];

describe('Spine JSON selective builds', () => {
  it('a bones-only selective build omits animation and easing packages', async () => {
    const bundle = await bundleSpineJsonExports(BONES_ONLY_ENTRY);
    for (const name of ['animation', 'easing']) {
      expect(bundle.packages.has(name), `should not pull @flighthq/${name}`).toBe(false);
    }
  });

  it('a bones-only build links no animation or skins handler modules', async () => {
    const bundle = await bundleSpineJsonExports(BONES_ONLY_ENTRY);
    for (const family of ALL_FAMILIES) {
      expect(contributedBytes(bundle, family.module), family.name).toBe(0);
      expect(bundle.code.includes(keptFunctionName(family.handler)), `${family.name} handler`).toBe(false);
    }
  });

  it('a bones-only build keeps the bones handler and parse core', async () => {
    const bundle = await bundleSpineJsonExports(BONES_ONLY_ENTRY);
    expect(contributedBytes(bundle, 'spineJsonBonesHandler.ts')).toBeGreaterThan(0);
    expect(contributedBytes(bundle, 'spineParse.ts')).toBeGreaterThan(0);
  });
});

describe('Spine JSON per-family cost', () => {
  for (const family of ALL_FAMILIES) {
    it(`links the ${family.name} family, and its packages, when registered`, async () => {
      const bundle = await bundleSpineJsonExports([...BONES_ONLY_ENTRY, family.handler]);
      expect(contributedBytes(bundle, family.module)).toBeGreaterThan(0);
      expect(bundle.code.includes(keptFunctionName(family.handler)), `${family.name} handler`).toBe(true);
      for (const name of family.packages) expect(bundle.packages.has(name), `@flighthq/${name}`).toBe(true);
    });
  }
});

describe('Spine JSON zero-config builds', () => {
  it('reaches every family through registerAllSpineJsonHandlers', async () => {
    const bundle = await bundleSpineJsonExports(['parseSpineSkeleton']);
    for (const family of ALL_FAMILIES) {
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

async function bundleSpineJsonExports(names: readonly string[]): Promise<BundleReach> {
  const result = await build({
    bundle: true,
    format: 'esm',
    keepNames: true,
    logLevel: 'silent',
    metafile: true,
    minify: true,
    stdin: {
      contents: `export { ${names.join(', ')} } from './contract.ts';`,
      resolveDir: getSkeleton2DFormatsSourceDirectory(),
      sourcefile: 'spine-json-reach.ts',
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
    if (match[1] === 'skeleton2d-formats') contributedBytes.set(match[2], contribution.bytesInOutput);
  }
  return { code: result.outputFiles[0].text, contributedBytes, packages };
}

function getSkeleton2DFormatsSourceDirectory(): string {
  const directory = new URL('../packages/skeleton2d-formats/src/', import.meta.url);
  const pathname = decodeURIComponent(directory.pathname);
  if (directory.hostname !== '') return `//${directory.hostname}${pathname}`;
  return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
}
