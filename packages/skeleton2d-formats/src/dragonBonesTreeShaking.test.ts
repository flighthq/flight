// @vitest-environment node

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

import * as contractApi from './contract.ts';
import * as publicApi from './index.ts';

const resolveDir = getFileUrlDirectory(import.meta.url);

const SECTION_ATOMS: readonly (readonly [handler: string, reader: string, hasBody: boolean])[] = [
  ['dragonBonesAnimationsSectionHandler', 'dragonBonesAnimationsSectionReader', true],
  ['dragonBonesBonesSectionHandler', 'dragonBonesBonesSectionReader', true],
  ['dragonBonesIkConstraintsSectionHandler', 'dragonBonesIkConstraintsSectionReader', false],
  ['dragonBonesSkinsSectionHandler', 'dragonBonesSkinsSectionReader', true],
  ['dragonBonesSlotsSectionHandler', 'dragonBonesSlotsSectionReader', true],
];

const NON_TRIVIAL_SECTION_READERS = SECTION_ATOMS.filter(([, , hasBody]) => hasBody).map(([, reader]) => reader);

const TIMELINE_ATOMS: readonly (readonly [handler: string, reader: string])[] = [
  ['dragonBonesBoneTimelineHandler', 'dragonBonesBoneTimelineReader'],
  ['dragonBonesDeformTimelineHandler', 'dragonBonesDeformTimelineReader'],
  ['dragonBonesIkTimelineHandler', 'dragonBonesIkTimelineReader'],
  ['dragonBonesSlotTimelineHandler', 'dragonBonesSlotTimelineReader'],
  ['dragonBonesZOrderTimelineHandler', 'dragonBonesZOrderTimelineReader'],
];

describe('DragonBones handler atom tree shaking', () => {
  it.each(SECTION_ATOMS)('keeps %s independent of its section siblings', async (atom, readerName, hasBody) => {
    const output = await bundleContractExport(atom);

    if (hasBody) {
      expect(output).toContain(getKeptFunctionNameMarker(readerName));
    }
    for (const siblingReader of NON_TRIVIAL_SECTION_READERS) {
      if (siblingReader !== readerName) {
        expect(output).not.toContain(getKeptFunctionNameMarker(siblingReader));
      }
    }
  });

  it.each(TIMELINE_ATOMS)('keeps %s independent of its timeline siblings', async (atom, readerName) => {
    const output = await bundleContractExport(atom);

    expect(output).toContain(getKeptFunctionNameMarker(readerName));
    for (const [, siblingReaderName] of TIMELINE_ATOMS) {
      if (siblingReaderName !== readerName) {
        expect(output).not.toContain(getKeptFunctionNameMarker(siblingReaderName));
      }
    }
  });
});

describe('DragonBones handler export lanes', () => {
  it('publishes generic registration without publishing built-in handler atoms', () => {
    expect(publicApi.registerDragonBonesSectionHandler).toBe(contractApi.registerDragonBonesSectionHandler);
    expect(publicApi.registerDragonBonesTimelineHandler).toBe(contractApi.registerDragonBonesTimelineHandler);

    for (const [atom] of [...SECTION_ATOMS, ...TIMELINE_ATOMS]) {
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
