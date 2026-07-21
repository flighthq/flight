import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveCaptureDirectoryServer, resolveServer, resolveStaticServer } from './captureServer';

describe('resolveCaptureDirectoryServer', () => {
  it('serves an already-built directory and shuts down', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'capture-directory-'));
    writeFileSync(join(directory, 'index.html'), '<h1>capturable</h1>');
    const server = await resolveCaptureDirectoryServer(directory);
    try {
      expect(await (await fetch(server.url)).text()).toContain('capturable');
    } finally {
      server.kill();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('resolveServer', () => {
  it('resolves immediately to an external URL, stripping a trailing slash', async () => {
    const server = await resolveServer({ tool: 'examples', root: '/repo', externalUrl: 'http://localhost:5173/' });
    expect(server.url).toBe('http://localhost:5173');
    expect(() => server.kill()).not.toThrow();
  });
});

describe('resolveStaticServer', () => {
  // Building and serving a real dist needs a full toolchain and Vite build, so this is exercised end to
  // end by the capture:* scripts. Here we only assert the entry point is wired.
  it('is a callable server resolver', () => {
    expect(typeof resolveStaticServer).toBe('function');
  });
});
