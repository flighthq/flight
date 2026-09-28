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
    handler: 'spineBinaryAnimationsSectionHandler',
    module: 'spineBinaryAnimationsHandler.ts',
    name: 'animations',
    packages: ['animation'],
  },
  {
    handler: 'spineBinarySkinsSectionHandler',
    module: 'spineBinarySkinsHandler.ts',
    name: 'skins',
    packages: ['entity'],
  },
];

const TIMELINE_FAMILIES: readonly HandlerFamily[] = [
  {
    handler: 'spineBinaryBoneTimelineHandler',
    module: 'spineBinaryBoneTimelineHandler.ts',
    name: 'bone timeline',
    packages: ['easing'],
  },
  {
    handler: 'spineBinarySlotTimelineHandler',
    module: 'spineBinarySlotTimelineHandler.ts',
    name: 'slot timeline',
    packages: [],
  },
  {
    handler: 'spineBinaryDrawOrderTimelineHandler',
    module: 'spineBinaryDrawOrderTimelineHandler.ts',
    name: 'draw order timeline',
    packages: [],
  },
];

const ALL_FAMILIES = [...SECTION_FAMILIES, ...TIMELINE_FAMILIES];

const BONES_SLOTS_ENTRY = [
  'createSpineBinaryRegistry',
  'registerSpineBinarySectionHandler',
  'parseSpineSkeletonBinaryWithRegistry',
  'spineBinaryBonesSectionHandler',
  'spineBinarySlotsSectionHandler',
];

describe('Spine Binary selective builds', () => {
  it('a bones+slots selective build omits easing', async () => {
    const bundle = await bundleSpineBinaryExports(BONES_SLOTS_ENTRY);
    expect(bundle.packages.has('easing'), 'should not pull @flighthq/easing').toBe(false);
  });

  it('a bones+slots build tree-shakes every handler function', async () => {
    const bundle = await bundleSpineBinaryExports(BONES_SLOTS_ENTRY);
    for (const family of ALL_FAMILIES) {
      expect(bundle.code.includes(keptFunctionName(family.handler)), `${family.name} handler`).toBe(false);
    }
  });

  it('a bones+slots build keeps the bones and slots handlers and parse core', async () => {
    const bundle = await bundleSpineBinaryExports(BONES_SLOTS_ENTRY);
    expect(contributedBytes(bundle, 'spineBinaryBonesHandler.ts')).toBeGreaterThan(0);
    expect(contributedBytes(bundle, 'spineBinarySlotsHandler.ts')).toBeGreaterThan(0);
    expect(contributedBytes(bundle, 'spineBinaryParse.ts')).toBeGreaterThan(0);
  });
});

describe('Spine Binary per-family cost', () => {
  for (const family of ALL_FAMILIES) {
    it(`links the ${family.name} handler when registered`, async () => {
      const bundle = await bundleSpineBinaryExports([...BONES_SLOTS_ENTRY, family.handler]);
      expect(bundle.code.includes(keptFunctionName(family.handler)), `${family.name} handler`).toBe(true);
      for (const name of family.packages) expect(bundle.packages.has(name), `@flighthq/${name}`).toBe(true);
    });
  }
});

describe('Spine Binary zero-config builds', () => {
  it('reaches every family through parseSpineSkeletonBinary', async () => {
    const bundle = await bundleSpineBinaryExports(['parseSpineSkeletonBinary']);
    for (const family of ALL_FAMILIES) {
      expect(bundle.code.includes(keptFunctionName(family.handler)), family.name).toBe(true);
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

async function bundleSpineBinaryExports(names: readonly string[]): Promise<BundleReach> {
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
      sourcefile: 'spine-binary-reach.ts',
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
