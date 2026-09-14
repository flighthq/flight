// @vitest-environment node

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

import * as contractApi from './contract';
import * as publicApi from './index';

const resolveDir = getFileUrlDirectory(import.meta.url);

const SECTION_ATOMS = [
  ['spineBinaryAnimationsSectionHandler', 'spineBinaryAnimationsSectionReader', 'readSpineBinaryAnimationsSection'],
  ['spineBinaryBonesSectionHandler', 'spineBinaryBonesSectionReader', 'readSpineBinaryBonesSection'],
  ['spineBinaryEventsSectionHandler', 'spineBinaryEventsSectionReader', 'readSpineBinaryEventsSection'],
  [
    'spineBinaryIkConstraintsSectionHandler',
    'spineBinaryIkConstraintsSectionReader',
    'readSpineBinaryIkConstraintsSection',
  ],
  [
    'spineBinaryPathConstraintsSectionHandler',
    'spineBinaryPathConstraintsSectionReader',
    'readSpineBinaryPathConstraintsSection',
  ],
  ['spineBinarySkinsSectionHandler', 'spineBinarySkinsSectionReader', 'readSpineBinarySkinsSection'],
  ['spineBinarySlotsSectionHandler', 'spineBinarySlotsSectionReader', 'readSpineBinarySlotsSection'],
  [
    'spineBinaryTransformConstraintsSectionHandler',
    'spineBinaryTransformConstraintsSectionReader',
    'readSpineBinaryTransformConstraintsSection',
  ],
] as const;

const TIMELINE_ATOMS = [
  ['spineBinaryBoneTimelineHandler', 'spineBinaryBoneTimelineReader', 'readSpineBinaryBoneTimelines'],
  ['spineBinaryDeformTimelineHandler', 'spineBinaryDeformTimelineReader', 'readSpineBinaryDeformTimelines'],
  ['spineBinaryDrawOrderTimelineHandler', 'spineBinaryDrawOrderTimelineReader', 'readSpineBinaryDrawOrderTimeline'],
  ['spineBinaryEventTimelineHandler', 'spineBinaryEventTimelineReader', 'readSpineBinaryEventTimelines'],
  ['spineBinaryIkTimelineHandler', 'spineBinaryIkTimelineReader', 'readSpineBinaryIkTimelines'],
  ['spineBinaryPathTimelineHandler', 'spineBinaryPathTimelineReader', 'readSpineBinaryPathTimelines'],
  ['spineBinarySlotTimelineHandler', 'spineBinarySlotTimelineReader', 'readSpineBinarySlotTimelines'],
  ['spineBinaryTransformTimelineHandler', 'spineBinaryTransformTimelineReader', 'readSpineBinaryTransformTimelines'],
] as const;

describe('Spine binary handler atom tree shaking', () => {
  it.each(SECTION_ATOMS)('keeps %s independent of its section siblings', async (atom, _readerExport, readerName) => {
    const output = await bundleContractExport(atom);

    expect(output).toContain(getKeptFunctionNameMarker(readerName));
    for (const [, , siblingReaderName] of SECTION_ATOMS) {
      if (siblingReaderName !== readerName) {
        expect(output).not.toContain(getKeptFunctionNameMarker(siblingReaderName));
      }
    }
  });

  it.each(TIMELINE_ATOMS)('keeps %s independent of its timeline siblings', async (atom, _readerExport, readerName) => {
    const output = await bundleContractExport(atom);

    expect(output).toContain(getKeptFunctionNameMarker(readerName));
    for (const [, , siblingReaderName] of TIMELINE_ATOMS) {
      if (siblingReaderName !== readerName) {
        expect(output).not.toContain(getKeptFunctionNameMarker(siblingReaderName));
      }
    }
  });
});

describe('Spine binary handler export lanes', () => {
  it('publishes generic registration without publishing built-in atoms or internal reader edges', () => {
    expect(publicApi.registerSpineBinarySectionHandler).toBe(contractApi.registerSpineBinarySectionHandler);
    expect(publicApi.registerSpineBinaryTimelineHandler).toBe(contractApi.registerSpineBinaryTimelineHandler);

    for (const [atom, readerExport] of [...SECTION_ATOMS, ...TIMELINE_ATOMS]) {
      expect(atom in contractApi, `${atom} contract`).toBe(true);
      expect(atom in publicApi, `${atom} public`).toBe(false);
      expect(readerExport in contractApi, `${readerExport} contract`).toBe(false);
      expect(readerExport in publicApi, `${readerExport} public`).toBe(false);
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
