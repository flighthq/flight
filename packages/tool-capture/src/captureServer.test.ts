import { describe, expect, it } from 'vitest';

import { resolveServer, resolveStaticServer } from './captureServer';

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
