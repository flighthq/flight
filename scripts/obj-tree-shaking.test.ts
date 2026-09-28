// @vitest-environment node

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

interface BundleReach {
  code: string;
  contributedBytes: ReadonlyMap<string, number>;
  packages: ReadonlySet<string>;
}

interface MaterialFamily {
  handler: string;
  keptFunction: string;
  module: string;
  name: string;
}

const BLINN_PHONG: MaterialFamily = {
  handler: 'objBlinnPhongMaterialHandler',
  keptFunction: 'objMaterialToBlinnPhong',
  module: 'objBlinnPhongMaterialHandler.ts',
  name: 'blinn-phong',
};

const STANDARD_PBR: MaterialFamily = {
  handler: 'objStandardPbrMaterialHandler',
  keptFunction: 'objMaterialToStandardPbr',
  module: 'objStandardPbrMaterialHandler.ts',
  name: 'standard-pbr',
};

const ALL_FAMILIES: readonly MaterialFamily[] = [BLINN_PHONG, STANDARD_PBR];

const PARSE_CORE = ['parseObjWithMaterialHandlers'];

describe('OBJ selective builds', () => {
  it('a blinn-phong-only build omits the StandardPbr conversion function', async () => {
    const bundle = await bundleObjExports([...PARSE_CORE, BLINN_PHONG.handler]);
    expect(bundle.code.includes(keptFunctionName(STANDARD_PBR.keptFunction)), 'objMaterialToStandardPbr').toBe(false);
    expect(bundle.code.includes(keptFunctionName(BLINN_PHONG.keptFunction)), 'objMaterialToBlinnPhong').toBe(true);
  });

  it('a blinn-phong-only build has zero bytes from the StandardPbr handler module', async () => {
    const bundle = await bundleObjExports([...PARSE_CORE, BLINN_PHONG.handler]);
    expect(contributedBytes(bundle, STANDARD_PBR.module), STANDARD_PBR.name).toBe(0);
    expect(contributedBytes(bundle, BLINN_PHONG.module), BLINN_PHONG.name).toBeGreaterThan(0);
  });

  it('a standard-pbr-only build omits the BlinnPhong conversion function', async () => {
    const bundle = await bundleObjExports([...PARSE_CORE, STANDARD_PBR.handler]);
    expect(bundle.code.includes(keptFunctionName(BLINN_PHONG.keptFunction)), 'objMaterialToBlinnPhong').toBe(false);
    expect(bundle.code.includes(keptFunctionName(STANDARD_PBR.keptFunction)), 'objMaterialToStandardPbr').toBe(true);
  });

  it('a standard-pbr-only build has zero bytes from the BlinnPhong handler module', async () => {
    const bundle = await bundleObjExports([...PARSE_CORE, STANDARD_PBR.handler]);
    expect(contributedBytes(bundle, BLINN_PHONG.module), BLINN_PHONG.name).toBe(0);
    expect(contributedBytes(bundle, STANDARD_PBR.module), STANDARD_PBR.name).toBeGreaterThan(0);
  });

  it('a parse-only build with no handler omits both conversion functions', async () => {
    const bundle = await bundleObjExports(PARSE_CORE);
    for (const family of ALL_FAMILIES) {
      expect(bundle.code.includes(keptFunctionName(family.keptFunction)), family.name).toBe(false);
      expect(contributedBytes(bundle, family.module), family.name).toBe(0);
    }
  });
});

describe('OBJ full builds', () => {
  it('parseObj links both material handler modules', async () => {
    const bundle = await bundleObjExports(['parseObj']);
    for (const family of ALL_FAMILIES) {
      expect(contributedBytes(bundle, family.module), family.name).toBeGreaterThan(0);
      expect(bundle.code.includes(keptFunctionName(family.keptFunction)), family.keptFunction).toBe(true);
    }
  });

  it('parseObj links the helpers module', async () => {
    const bundle = await bundleObjExports(['parseObj']);
    expect(contributedBytes(bundle, 'objMaterialHelpers.ts')).toBeGreaterThan(0);
  });
});

function contributedBytes(bundle: Readonly<BundleReach>, module: string): number {
  return bundle.contributedBytes.get(module) ?? 0;
}

function keptFunctionName(symbol: string): string {
  return `,"${symbol}")`;
}

async function bundleObjExports(names: readonly string[]): Promise<BundleReach> {
  const result = await build({
    bundle: true,
    format: 'esm',
    keepNames: true,
    logLevel: 'silent',
    metafile: true,
    minify: true,
    stdin: {
      contents: `export { ${names.join(', ')} } from './contract.ts';`,
      resolveDir: getScene3DFormatsSourceDirectory(),
      sourcefile: 'obj-reach.ts',
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
