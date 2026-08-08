const childProcessMocks = vi.hoisted(() => ({ spawnSync: vi.fn(() => ({ status: 0 })) }));

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal()),
  spawnSync: childProcessMocks.spawnSync,
}));

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  explainCaptureDistStaleness,
  resolveCaptureDirectoryServer,
  resolveServer,
  resolveStaticServer,
} from './captureServer';

describe('explainCaptureDistStaleness', () => {
  it('warns when the build predates the source it was built from', () => {
    expect(explainCaptureDistStaleness(1_000, 2_000)).toContain('measures the PREVIOUS code');
  });

  it('stays silent when the build is at least as new as the source', () => {
    expect(explainCaptureDistStaleness(2_000, 1_000)).toBeNull();
    expect(explainCaptureDistStaleness(1_000, 1_000)).toBeNull();
  });

  it('stays silent when a timestamp could not be read', () => {
    // A comparison that could not be made must not print a reassurance OR a warning: the caller
    // learns nothing either way, and a warning nobody can act on trains people to ignore it.
    expect(explainCaptureDistStaleness(null, 2_000)).toBeNull();
    expect(explainCaptureDistStaleness(1_000, null)).toBeNull();
  });
});

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
  it('uses npm rather than treating an inherited npx CLI as the npm CLI', async () => {
    const root = mkdtempSync(join(tmpdir(), 'capture-static-'));
    const dist = join(root, 'examples', 'runners', 'web', 'dist');
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<h1>built</h1>');
    const originalNpmExecPath = process.env['npm_execpath'];
    process.env['npm_execpath'] = '/usr/local/lib/node_modules/npm/bin/npx-cli.js';

    let server;
    try {
      server = await resolveStaticServer({ tool: 'examples', root, forceBuild: true });
      expect(childProcessMocks.spawnSync).toHaveBeenCalledWith(
        'npm',
        ['run', 'build', '--workspace=@flighthq/examples'],
        { cwd: root, stdio: 'inherit', shell: true },
      );
      expect(await (await fetch(server.url)).text()).toContain('built');
    } finally {
      server?.kill();
      if (originalNpmExecPath === undefined) delete process.env['npm_execpath'];
      else process.env['npm_execpath'] = originalNpmExecPath;
      rmSync(root, { recursive: true, force: true });
    }
  });
});
