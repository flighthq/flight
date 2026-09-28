// @vitest-environment node

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

import * as contractApi from './contract.ts';
import * as publicApi from './index.ts';

const resolveDir = getFileUrlDirectory(import.meta.url);

const SECTION_ATOMS: readonly (readonly [handler: string, hasBody: boolean])[] = [
  ['spineJsonAnimationsSectionHandler', true],
  ['spineJsonBonesSectionHandler', true],
  ['spineJsonEventsSectionHandler', false],
  ['spineJsonIkConstraintsSectionHandler', false],
  ['spineJsonPathConstraintsSectionHandler', false],
  ['spineJsonSkinsSectionHandler', true],
  ['spineJsonSlotsSectionHandler', true],
  ['spineJsonTransformConstraintsSectionHandler', false],
];

const NON_TRIVIAL_SECTION_HANDLERS = SECTION_ATOMS.filter(([, hasBody]) => hasBody).map(([handler]) => handler);

const TIMELINE_ATOMS: readonly string[] = [
  'spineJsonBoneTimelineHandler',
  'spineJsonDeformTimelineHandler',
  'spineJsonDrawOrderTimelineHandler',
  'spineJsonEventTimelineHandler',
  'spineJsonIkTimelineHandler',
  'spineJsonPathTimelineHandler',
  'spineJsonSlotTimelineHandler',
  'spineJsonTransformTimelineHandler',
];

describe('Spine JSON handler atom tree shaking', () => {
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

  it.each(TIMELINE_ATOMS)('keeps %s independent of its timeline siblings', async (atom) => {
    const output = await bundleContractExport(atom);

    expect(output).toContain(getKeptFunctionNameMarker(atom));
    for (const sibling of TIMELINE_ATOMS) {
      if (sibling !== atom) {
        expect(output).not.toContain(getKeptFunctionNameMarker(sibling));
      }
    }
  });
});

describe('Spine JSON handler export lanes', () => {
  it('publishes generic registration without publishing built-in handler atoms', () => {
    expect(publicApi.registerSpineJsonSectionHandler).toBe(contractApi.registerSpineJsonSectionHandler);
    expect(publicApi.registerSpineJsonTimelineHandler).toBe(contractApi.registerSpineJsonTimelineHandler);

    for (const [atom] of SECTION_ATOMS) {
      expect(atom in contractApi, `${atom} contract`).toBe(true);
      expect(atom in publicApi, `${atom} public`).toBe(false);
    }
    for (const atom of TIMELINE_ATOMS) {
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
