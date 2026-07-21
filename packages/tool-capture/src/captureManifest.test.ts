import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseCaptureManifest, readCaptureManifest } from './captureManifest';

describe('parseCaptureManifest', () => {
  it('parses a declarative entry and its renderer routes', () => {
    expect(
      parseCaptureManifest(
        JSON.stringify({
          subject: 'app',
          entries: [{ name: 'home', renderers: ['webgl'], routes: { webgl: 'home/' } }],
        }),
      ),
    ).toEqual({
      subject: 'app',
      entries: [{ name: 'home', renderers: ['webgl'], routes: { webgl: 'home/' } }],
    });
  });

  it('rejects an incomplete manifest', () => {
    expect(() => parseCaptureManifest('{"entries":[]}')).toThrow(/missing subject/);
    expect(() => parseCaptureManifest('{"subject":"app"}')).toThrow(/missing entries/);
    expect(() => parseCaptureManifest('{"subject":"app","entries":[{"name":"home","renderers":["webgl"]}]}')).toThrow(
      /needs a route/,
    );
  });
});

describe('readCaptureManifest', () => {
  it('reads and parses a JSON manifest file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'capture-manifest-'));
    const path = join(directory, 'tool-capture.json');
    writeFileSync(path, '{"subject":"app","entries":[]}');
    try {
      expect(readCaptureManifest(path)).toEqual({ subject: 'app', entries: [] });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
