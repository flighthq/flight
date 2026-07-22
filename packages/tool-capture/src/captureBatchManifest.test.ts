import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseCaptureBatchManifest, readCaptureBatchManifest } from './captureBatchManifest';

describe('parseCaptureBatchManifest', () => {
  it('parses subject arguments and optional operations', () => {
    expect(
      parseCaptureBatchManifest(
        JSON.stringify({
          subjects: [
            { name: 'icons', args: ['--manifest=icons/tool-capture.json', '--url=http://localhost:5173'] },
            { name: 'models', args: ['--manifest=models/tool-capture.json'], operations: ['validate', 'benchmark'] },
          ],
        }),
      ),
    ).toEqual({
      subjects: [
        { name: 'icons', args: ['--manifest=icons/tool-capture.json', '--url=http://localhost:5173'] },
        { name: 'models', args: ['--manifest=models/tool-capture.json'], operations: ['validate', 'benchmark'] },
      ],
    });
  });

  it('rejects empty and malformed plans', () => {
    expect(() => parseCaptureBatchManifest('{}')).toThrow(/subjects/);
    expect(() => parseCaptureBatchManifest('{"subjects":[]}')).toThrow(/subjects/);
    expect(() => parseCaptureBatchManifest('{"subjects":[{"name":"icons","args":true}]}')).toThrow(/args/);
    expect(() =>
      parseCaptureBatchManifest('{"subjects":[{"name":"icons","args":[],"operations":["publish"]}]}'),
    ).toThrow(/operations/);
  });
});

describe('readCaptureBatchManifest', () => {
  it('reads and parses a batch plan from disk', () => {
    const directory = mkdtempSync(join(tmpdir(), 'capture-batch-'));
    const path = join(directory, 'tool-capture.batch.json');
    writeFileSync(path, '{"subjects":[{"name":"icons","args":[]}]}');
    try {
      expect(readCaptureBatchManifest(path)).toEqual({ subjects: [{ name: 'icons', args: [] }] });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
