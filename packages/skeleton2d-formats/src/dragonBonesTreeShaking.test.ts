// @vitest-environment node

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

import * as contractApi from './contract.ts';
import * as publicApi from './index.ts';

const resolveDir = getFileUrlDirectory(import.meta.url);

const SECTION_ATOMS: readonly (readonly [handler: string, hasBody: boolean])[] = [
  ['dragonBonesAnimationsSectionHandler', true],
  ['dragonBonesBonesSectionHandler', true],
  ['dragonBonesIkConstraintsSectionHandler', false],
  ['dragonBonesSkinsSectionHandler', true],
  ['dragonBonesSlotsSectionHandler', true],
];

const NON_TRIVIAL_SECTION_HANDLERS = SECTION_ATOMS.filter(([, hasBody]) => hasBody).map(([handler]) => handler);

const TIMELINE_ATOMS: readonly string[] = [
  'dragonBonesBoneTimelineHandler',
  'dragonBonesDeformTimelineHandler',
  'dragonBonesIkTimelineHandler',
  'dragonBonesSlotTimelineHandler',
  'dragonBonesZOrderTimelineHandler',
];

describe('DragonBones handler atom tree shaking', () => {
  it.each(SECTION_ATOMS)('keeps %s independent of its section siblings', async (atom, hasBody) => {
    const output = await bundleContractExport(atom);

    if (hasBody) {
      expect(output).toContain(getKeptFunctionNameMarker(atom));
    }
    for (const siblingHandler of NON_TRIVIAL_SECTION_HANDLERS) {
      if (siblingHandler !== atom) {
        expect(output).not.toContain(getKeptFunctionNameMarker(siblingHandler));
      }
    }
  });

  it.each(TIMELINE_ATOMS.map((h) => [h]))('keeps %s independent of its timeline siblings', async (atom) => {
    const output = await bundleContractExport(atom);

    expect(output).toContain(getKeptFunctionNameMarker(atom));
    for (const siblingHandler of TIMELINE_ATOMS) {
      if (siblingHandler !== atom) {
        expect(output).not.toContain(getKeptFunctionNameMarker(siblingHandler));
      }
    }
  });
});

describe('DragonBones handler export lanes', () => {
  it('publishes generic registration without publishing built-in handler atoms', () => {
    expect(publicApi.registerDragonBonesSectionHandler).toBe(contractApi.registerDragonBonesSectionHandler);
    expect(publicApi.registerDragonBonesTimelineHandler).toBe(contractApi.registerDragonBonesTimelineHandler);

    for (const atom of [...SECTION_ATOMS.map(([h]) => h), ...TIMELINE_ATOMS]) {
      expect(atom in contractApi, `${atom} contract`).toBe(true);
      expect(atom in publicApi, `${atom} public`).toBe(false);
    }
  });
});

async function bundleContractExport(name: string): Promise<string> {
  const result = await build({
    bundle: true,
    format: 'esm',
    keepNames: true,
    logLevel: 'silent',
    minify: true,
    packages: 'external',
    stdin: {
      contents: `export { ${name} } from './contract.ts';`,
      resolveDir,
      sourcefile: `tree-shake-${name}.ts`,
    },
    treeShaking: true,
    write: false,
  });
  return result.outputFiles[0].text;
}

function getFileUrlDirectory(url: string): string {
  const directory = new URL('.', url);
  const pathname = decodeURIComponent(directory.pathname);
  if (directory.hostname !== '') return `//${directory.hostname}${pathname}`;
  return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
}

function getKeptFunctionNameMarker(name: string): string {
  return `,"${name}")`;
}
