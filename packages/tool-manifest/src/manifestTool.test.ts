import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runManifestTool } from './manifestTool.js';

describe('runManifestTool', () => {
  it('prints usage and fails with no arguments, succeeds for an explicit --help', async () => {
    const noArgs = createIO();
    expect(await runManifestTool([], noArgs.io)).toBe(1);
    expect(noArgs.output()).toContain('Usage: flight-manifest');

    const help = createIO();
    expect(await runManifestTool(['--help'], help.io)).toBe(0);
  });

  it('rejects an unknown command rather than doing nothing quietly', async () => {
    const io = createIO();
    expect(await runManifestTool(['frobnicate'], io.io)).toBe(1);
    expect(io.errors()).toContain('unknown command: frobnicate');
  });

  it('scans a directory of content into one merged requirement set', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'flight-manifest-'));
    await writeFile(join(dir, 'a.swf'), createSwf());
    await writeFile(join(dir, 'ignored.txt'), 'not content');
    const out = join(dir, 'set.json');

    const io = createIO();
    expect(await runManifestTool(['scan', '--content', dir, '--out', out], io.io)).toBe(0);
    const written = JSON.parse(await readFile(out, 'utf8'));
    expect(written.covers).toEqual(['document.format', 'scene.shape-command']);
    expect(written.requirements.filter(({ facet }: { facet: string }) => facet === 'document.format')).toEqual([
      { facet: 'document.format', key: 'swf.DefineShape' },
    ]);
    // The SWF analyzer owns the exact core-command vocabulary. This tool-level test verifies that scan
    // preserves its second facet and requirements instead of duplicating that vocabulary here.
    const shapeCommands = written.requirements.filter(
      ({ facet }: { facet: string }) => facet === 'scene.shape-command',
    );
    expect(shapeCommands.length).toBeGreaterThan(0);
    expect(shapeCommands).toContainEqual({ facet: 'scene.shape-command', key: 'beginFill' });
    expect(shapeCommands).toContainEqual({ facet: 'scene.shape-command', key: 'quadraticCurveTo' });
  });

  it('reports a requirement the baseline does not cover and fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'flight-manifest-'));
    const required = join(dir, 'required.json');
    const available = join(dir, 'available.json');
    await writeFile(required, JSON.stringify(set([{ facet: 'document.format', key: 'ShowFrame' }])));
    await writeFile(available, JSON.stringify(set([])));

    const io = createIO();
    expect(await runManifestTool(['diff', '--required', required, '--available', available], io.io)).toBe(1);
    expect(io.errors()).toContain('missing document.format ShowFrame');
  });

  it('passes a diff whose requirements are all covered', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'flight-manifest-'));
    const path = join(dir, 'both.json');
    await writeFile(path, JSON.stringify(set([{ facet: 'document.format', key: 'ShowFrame' }])));

    const io = createIO();
    expect(await runManifestTool(['diff', '--required', path, '--available', path], io.io)).toBe(0);
    expect(io.output()).toContain('all requirements are covered');
  });

  it('merges several sets into one', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'flight-manifest-'));
    const a = join(dir, 'a.json');
    const b = join(dir, 'b.json');
    const out = join(dir, 'merged.json');
    await writeFile(a, JSON.stringify(set([{ facet: 'document.format', key: 'ShowFrame' }])));
    await writeFile(b, JSON.stringify(set([{ facet: 'document.format', key: 'DefineShape' }])));

    const io = createIO();
    expect(await runManifestTool(['merge', '--set', a, '--set', b, '--out', out], io.io)).toBe(0);
    expect(JSON.parse(await readFile(out, 'utf8')).requirements).toEqual([
      { facet: 'document.format', key: 'DefineShape' },
      { facet: 'document.format', key: 'ShowFrame' },
    ]);
  });

  it('fails a plan that leaves a requirement unresolved, naming it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'flight-manifest-'));
    const setPath = join(dir, 'set.json');
    const catalogPath = join(dir, 'catalog.json');
    await writeFile(setPath, JSON.stringify(set([{ facet: 'document.format', key: 'ShowFrame' }])));
    await writeFile(catalogPath, JSON.stringify({ entries: [] }));

    const io = createIO();
    expect(
      await runManifestTool(['plan', '--set', setPath, '--catalog', catalogPath, '--backend', 'canvas'], io.io),
    ).toBe(1);
    expect(io.errors()).toContain('unresolved document.format ShowFrame');
  });

  it('reports a malformed input file instead of throwing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'flight-manifest-'));
    const bad = join(dir, 'bad.json');
    await writeFile(bad, '{');

    const io = createIO();
    expect(await runManifestTool(['diff', '--required', bad, '--available', bad], io.io)).toBe(1);
    expect(io.errors()).toContain('not valid JSON');
  });
});

function createIO() {
  const errors: string[] = [];
  const output: string[] = [];
  return {
    errors: () => errors.join(''),
    io: { writeError: (m: string) => errors.push(m), writeOutput: (m: string) => output.push(m) },
    output: () => output.join(''),
  };
}

function set(requirements: ReadonlyArray<{ facet: string; key: string }>) {
  return { covers: ['document.format'], requirements };
}

// A minimal SWF carrying exactly one DefineShape tag, built here so the test needs no fixture file.
// It must be a CONTENT tag: `parseSwfRequirements` emits nothing for structural or metadata tags,
// so a ShowFrame-only file scans to an empty set and would make this assertion vacuous.
function createSwf(): Uint8Array {
  const rectangle = new Uint8Array([0x00]);
  const body = new Uint8Array([...rectangle, 0x00, 0x18, 0x01, 0x00, 0x80, 0x00, 0x00, 0x00]);
  const file = new Uint8Array(8 + body.length);
  file.set([0x46, 0x57, 0x53, 9], 0);
  new DataView(file.buffer).setUint32(4, file.length, true);
  file.set(body, 8);
  return file;
}
