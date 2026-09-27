import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  BUILT_IN_REQUIREMENT_BACKENDS,
  BUILT_IN_REQUIREMENT_CATALOG_ENTRIES,
  BUILT_IN_REQUIREMENT_DISPOSITIONS,
  BUILT_IN_REQUIREMENT_TRANSLATIONS,
} from '@flighthq/requirement-catalog/contract';

import { createManifestPlugin } from './manifestPlugin.ts';

// Rive core type keys from the shipped object model: Shape 3, Rectangle 7, Path 12, SolidColor 18,
// ClippingShape (the kernel-dependent family) and Text 134.
const SHAPE = 3;
const RECTANGLE = 7;
const PATH = 12;
const SOLID_COLOR = 18;
const TEXT = 134;
const CLIPPING_SHAPE = 42;

// ★ RIVE IS THE ONE FORMAT WHOSE ROWS NAME A FUNCTION TO CALL. Every other format emits an ordered list of
// handler VALUES into one options field; a Rive family is installed by calling a registrar, and one of them
// also needs a path-boolean kernel. So the emitted module carries TWO fields — `registrars` and
// `pathBooleanRegistrars` — that spread into RiveImportOptions, and applying them is an explicit step the
// caller takes. These cases assert that split end to end, through the real plugin.

describe('Rive content through the built-in catalog', () => {
  it('resolves each present core type to the registrar that installs it', async () => {
    const { diagnostics, source } = await load(riveFile([PATH, SOLID_COLOR]));
    expect(parserList(source, 'registrars')).toEqual(['registerRivePathHandlers', 'registerRivePaintHandlers']);
    expect(diagnostics).toEqual([]);
  });

  it('imports the registrars from the package lane an application can import', async () => {
    const { source } = await load(riveFile([PATH]));
    expect(source).toContain("from '@flighthq/scene2d-formats';");
    expect(source).not.toContain('/src/');
  });

  // ★ THE INHERITED CASE, END TO END. Rectangle -> ParametricPath -> Path, so a file of Rectangles needs the
  // PATH family. If the analyzer emitted `riv.Rectangle` instead, no row would claim it and this correctly
  // handled file would be reported as a gap.
  it('resolves an inherited core type to the family that reads it', async () => {
    const { diagnostics, source } = await load(riveFile([RECTANGLE]));
    expect(parserList(source, 'registrars')).toEqual(['registerRivePathHandlers']);
    expect(diagnostics).toEqual([]);
  });

  // ★ THE DEPENDENCY SPLIT, WHICH IS THE WHOLE REASON FOR TWO FIELDS. Clipping lands in its own field, so a
  // caller spreads it into `pathBooleanRegistrars` and supplies a kernel only when the content needs one.
  it('routes the kernel-dependent clipping family to its own field', async () => {
    const { source } = await load(riveFile([CLIPPING_SHAPE]));
    expect(parserList(source, 'pathBooleanRegistrars')).toEqual(['registerRiveClippingHandlers']);
    expect(parserList(source, 'registrars')).toEqual([]);
  });

  it('emits both fields for content needing both, each carrying only its own registrars', async () => {
    const { source } = await load(riveFile([PATH, CLIPPING_SHAPE]));
    expect(parserList(source, 'registrars')).toEqual(['registerRivePathHandlers']);
    expect(parserList(source, 'pathBooleanRegistrars')).toEqual(['registerRiveClippingHandlers']);
  });

  // ★ THE OMISSION CLAIM. A document with no clipping must not name the clipping registrar at all — that is
  // what keeps a path-boolean implementation out of the build. Asserted alongside the families that DO appear,
  // so it is a subtraction rather than a bare absence.
  it('names no family the content does not need', async () => {
    const { source } = await load(riveFile([TEXT]));
    expect(parserList(source, 'registrars')).toEqual(['registerRiveTextHandlers']);
    for (const absent of [
      'registerRiveClippingHandlers',
      'registerRiveSkeletonHandlers',
      'registerRiveStateMachineHandlers',
      'registerRiveLayoutHandlers',
    ]) {
      expect(source, `${absent} rode in on a text-only document`).not.toContain(absent);
    }
    expect(source).not.toContain('pathBooleanRegistrars');
  });

  it('emits an empty parserOptions for a readable document with no objects', async () => {
    const { source } = await load(riveFile([]));
    expect(source).toContain('export const parserOptions = {};');
  });

  it('reports an unreadable file rather than analyzing it to nothing', async () => {
    const { diagnostics } = await load(new Uint8Array([0x4e, 0x4f, 0x50, 0x45]));
    expect(diagnostics.some((message) => message.includes('unreadable'))).toBe(true);
  });

  // A core type no family reads keeps its own name, so it surfaces as a gap rather than resolving to a family
  // that would not have handled it. Node is such a type: nothing in its chain is registered.
  it('still reports a core type no family reads', async () => {
    const { diagnostics } = await load(riveFile([2]));
    expect(diagnostics).toEqual(['no catalog entry for document.format riv.Node: <file>']);
  });
});

async function load(content: Uint8Array): Promise<{ diagnostics: string[]; source: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'rive-manifest-'));
  await writeFile(join(dir, 'a.riv'), Buffer.from(content));
  const diagnostics: string[] = [];
  const plugin = createManifestPlugin({
    catalog: {
      backends: BUILT_IN_REQUIREMENT_BACKENDS,
      dispositions: BUILT_IN_REQUIREMENT_DISPOSITIONS,
      entries: [...BUILT_IN_REQUIREMENT_CATALOG_ENTRIES],
      translations: BUILT_IN_REQUIREMENT_TRANSLATIONS,
    },
    onDiagnostic: (message) => diagnostics.push(message),
  });
  const id = plugin.resolveId('./a.riv?manifest', join(dir, 'entry.ts'))!;
  // Awaited BEFORE the diagnostics are read: snapshotting the array first leaves every `toEqual([])` unable
  // to fail.
  const source = (await plugin.load(id))!;
  return { diagnostics: diagnostics.map((message) => message.replace(join(dir, 'a.riv'), '<file>')), source };
}

// Reads one emitted array back as a list of symbol names, so an assertion states the contents and order rather
// than pinning a block of text any unrelated addition would break.
function parserList(source: string, field: string): readonly string[] {
  const start = source.indexOf(`  ${field}: [`);
  if (start === -1) return [];
  return source
    .slice(start, source.indexOf('  ],', start))
    .split('\n')
    .slice(1)
    .map((line) => line.trim().replace(/,$/, ''))
    .filter((line) => line.length > 0);
}

// A `.riv` container: 'RIVE', varuint major/minor/fileId, a terminated (here empty) property table of contents,
// then one varuint type key per object each terminated by a zero property key.
function riveFile(typeKeys: readonly number[]): Uint8Array {
  const bytes: number[] = [0x52, 0x49, 0x56, 0x45];
  bytes.push(...varUint(7), ...varUint(0), ...varUint(0));
  bytes.push(0);
  for (const typeKey of typeKeys) bytes.push(...varUint(typeKey), 0);
  return new Uint8Array(bytes);
}

function varUint(value: number): number[] {
  const out: number[] = [];
  let remaining = value;
  while (remaining > 0x7f) {
    out.push((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }
  out.push(remaining);
  return out;
}
