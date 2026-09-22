import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach } from 'vitest';

import { runManifestTool } from './manifestTool.js';

let directory: string;
let errors: string[];
let outputs: string[];

const io = {
  writeError: (message: string) => {
    errors.push(message);
  },
  writeOutput: (message: string) => {
    outputs.push(message);
  },
};

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'flight-manifest-'));
  errors = [];
  outputs = [];
});

afterEach(async () => {
  await rm(directory, { force: true, recursive: true });
});

const path = (name: string): string => join(directory, name);

async function write(name: string, value: unknown): Promise<string> {
  const file = path(name);
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return file;
}

const manifest = (features: Record<string, string[]>) => ({ features, schemaVersion: 1, settings: {} });
const analysis = (source: string, observations: Record<string, string[]>) => ({
  observations,
  schemaVersion: 1,
  source,
});

describe('runManifestTool', () => {
  it('prints usage and fails with no arguments', async () => {
    expect(await runManifestTool([], io)).toBe(1);
    expect(outputs.join('')).toContain('Usage: flight-manifest');
  });

  it('prints usage and succeeds for --help', async () => {
    expect(await runManifestTool(['--help'], io)).toBe(0);
  });

  it('rejects an unknown command', async () => {
    expect(await runManifestTool(['frobnicate'], io)).toBe(1);
  });

  // scan consumes analyses a DOMAIN produced. This tool reads no content itself, which is why the
  // fixtures here are serialized analyses rather than .swf or .awd files.
  it('scans a directory of serialized analyses into one manifest', async () => {
    const analyses = path('analyses');
    await mkdir(join(analyses, 'nested'), { recursive: true });
    await writeFile(join(analyses, 'a.json'), JSON.stringify(analysis('a', { k: ['one'] })), 'utf8');
    await writeFile(join(analyses, 'nested', 'b.json'), JSON.stringify(analysis('b', { k: ['two'] })), 'utf8');

    const out = path('scanned.json');
    expect(await runManifestTool(['scan', '--analyses', analyses, '--out', out], io)).toBe(0);
    expect(JSON.parse(await readFile(out, 'utf8')).features).toEqual({ k: ['one', 'two'] });
  });

  it('fails a scan when an analysis file is malformed, naming the file', async () => {
    const analyses = path('bad');
    await mkdir(analyses, { recursive: true });
    await writeFile(join(analyses, 'broken.json'), '{ "schemaVersion": 9 }', 'utf8');
    expect(await runManifestTool(['scan', '--analyses', analyses, '--out', path('x.json')], io)).toBe(1);
    expect(errors.join('')).toContain('broken.json');
  });

  it('analyzes one analysis through a mapping', async () => {
    const analysisFile = await write('analysis.json', analysis('fixture', { k: ['one'] }));
    const mappingFile = await write('mapping.json', { k: { features: { one: ['feature.one'] }, group: 'g' } });
    const out = path('analyzed.json');
    expect(
      await runManifestTool(['analyze', '--analysis', analysisFile, '--mapping', mappingFile, '--out', out], io),
    ).toBe(0);
    expect(JSON.parse(await readFile(out, 'utf8')).features).toEqual({ g: ['feature.one'] });
  });

  it('reports unmapped observations without failing, since a growing mapping is normal', async () => {
    const analysisFile = await write('analysis.json', analysis('fixture', { k: ['unknown'] }));
    const mappingFile = await write('mapping.json', { k: { features: {}, group: 'g' } });
    expect(await runManifestTool(['analyze', '--analysis', analysisFile, '--mapping', mappingFile], io)).toBe(0);
    expect(errors.join('')).toContain('unmapped: k:unknown');
  });

  it('unions several manifests', async () => {
    const first = await write('first.json', manifest({ g: ['a'] }));
    const second = await write('second.json', manifest({ g: ['b'] }));
    const out = path('united.json');
    expect(await runManifestTool(['union', '--manifest', first, '--manifest', second, '--out', out], io)).toBe(0);
    expect(JSON.parse(await readFile(out, 'utf8')).features).toEqual({ g: ['a', 'b'] });
  });

  it('exits 0 for a satisfied diff and 1 when a feature is missing', async () => {
    const required = await write('required.json', manifest({ g: ['a'] }));
    const satisfied = await write('satisfied.json', manifest({ g: ['a', 'b'] }));
    const lacking = await write('lacking.json', manifest({ g: ['b'] }));
    expect(await runManifestTool(['diff', '--required', required, '--available', satisfied], io)).toBe(0);
    expect(await runManifestTool(['diff', '--required', required, '--available', lacking], io)).toBe(1);
  });

  it('generates a module importing exactly the required features', async () => {
    const manifestFile = await write('manifest.json', manifest({ g: ['feature.one'] }));
    const registryFile = await write('registry.json', {
      g: { 'feature.one': { binding: 'one', module: '@example/one' } },
    });
    const out = path('generated.ts');
    expect(
      await runManifestTool(['generate', '--manifest', manifestFile, '--registry', registryFile, '--out', out], io),
    ).toBe(0);
    const source = await readFile(out, 'utf8');
    expect(source).toContain("import { one } from '@example/one';");
    expect(source).toContain('export const g = [one];');
  });

  // Fatal, unlike an unmapped observation: a generated file quietly missing a required feature is a
  // build that is wrong in a way nothing downstream can detect.
  it('fails generation when a required feature has no import', async () => {
    const manifestFile = await write('manifest.json', manifest({ g: ['feature.missing'] }));
    const registryFile = await write('registry.json', { g: {} });
    expect(
      await runManifestTool(
        ['generate', '--manifest', manifestFile, '--registry', registryFile, '--out', path('o.ts')],
        io,
      ),
    ).toBe(1);
    expect(errors.join('')).toContain('no import for: g:feature.missing');
  });

  it('rejects a command missing a required flag', async () => {
    expect(await runManifestTool(['union', '--out', path('o.json')], io)).toBe(1);
  });

  it('reports a read failure rather than throwing', async () => {
    expect(
      await runManifestTool(['diff', '--required', path('absent.json'), '--available', path('also.json')], io),
    ).toBe(1);
    expect(errors.join('')).not.toBe('');
  });
});
