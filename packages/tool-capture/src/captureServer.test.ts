const childProcessMocks = vi.hoisted(() => ({ spawnSync: vi.fn(() => ({ status: 0 })) }));

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal()),
  spawnSync: childProcessMocks.spawnSync,
}));

import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CAPTURE_BUILD_IDENTITY_FILE } from './captureBuildIdentity';
import {
  explainCaptureDistStaleness,
  resolveCaptureDirectoryServer,
  resolveServer,
  resolveStaticServer,
} from './captureServer';

describe('explainCaptureDistStaleness', () => {
  it('reports when the build predates the source it was built from', () => {
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
    const build = {
      commit: 'a'.repeat(40),
      dirty: ['functional/scenes/changed.ts'],
      dirtyOmitted: 0,
    } as const;
    writeFileSync(join(directory, CAPTURE_BUILD_IDENTITY_FILE), JSON.stringify(build));
    const server = await resolveCaptureDirectoryServer(directory);
    try {
      expect(await (await fetch(server.url)).text()).toContain('capturable');
      expect(server.build).toEqual(build);
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
  it('refuses a stale functional dist that omits currently discovered routes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'capture-static-stale-'));
    const dist = join(root, 'tools', 'functional', 'dist');
    const scenes = join(root, 'functional', 'scenes');
    mkdirSync(dist, { recursive: true });
    mkdirSync(scenes, { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<h1>old build</h1>');
    writeFileSync(join(scenes, 'new-scene.webgl.ts'), 'export {};');
    writeFileSync(join(scenes, 'new-scene.webgpu.ts'), 'export {};');

    try {
      await expect(resolveStaticServer({ tool: 'functional', root })).rejects.toThrow(
        /Functional dist is missing 2 of 2 discovered routes.*npm run build:functional.*tests\/new-scene\/webgl\/, tests\/new-scene\/webgpu\//,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ['an existing scene', 'functional/scenes/existing-scene.webgl.ts'],
    ['its Vite config', 'tools/functional/vite.config.ts'],
    ['the shared harness', 'tools/harness/render.ts'],
  ])('refuses a functional dist older than %s', async (_description, newerSource) => {
    const root = mkdtempSync(join(tmpdir(), 'capture-static-old-'));
    const dist = join(root, 'tools', 'functional', 'dist');
    const route = join(dist, 'tests', 'existing-scene', 'webgl');
    const scene = join(root, 'functional', 'scenes', 'existing-scene.webgl.ts');
    mkdirSync(route, { recursive: true });
    mkdirSync(join(root, 'functional', 'scenes'), { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<h1>old build</h1>');
    writeFileSync(join(route, 'index.html'), '<h1>old route</h1>');
    writeFileSync(scene, 'export {};');
    mkdirSync(dirname(join(root, newerSource)), { recursive: true });
    if (join(root, newerSource) !== scene) writeFileSync(join(root, newerSource), 'export {};');
    utimesSync(scene, 1, 1);
    utimesSync(join(dist, 'index.html'), 2, 2);
    utimesSync(join(route, 'index.html'), 2, 2);
    utimesSync(join(root, newerSource), 3, 3);

    try {
      await expect(resolveStaticServer({ tool: 'functional', root })).rejects.toThrow(
        /static build is older.*npm run build:functional/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('serves a complete functional dist newer than its build inputs', async () => {
    const root = mkdtempSync(join(tmpdir(), 'capture-static-fresh-'));
    const dist = join(root, 'tools', 'functional', 'dist');
    const route = join(dist, 'tests', 'existing-scene', 'webgl');
    const scene = join(root, 'functional', 'scenes', 'existing-scene.webgl.ts');
    const config = join(root, 'tools', 'functional', 'vite.config.ts');
    const harness = join(root, 'tools', 'harness', 'render.ts');
    mkdirSync(route, { recursive: true });
    mkdirSync(join(root, 'functional', 'scenes'), { recursive: true });
    mkdirSync(join(root, 'tools', 'harness'), { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<h1>fresh build</h1>');
    writeFileSync(join(route, 'index.html'), '<h1>fresh route</h1>');
    writeFileSync(scene, 'export {};');
    writeFileSync(config, 'export default {};');
    writeFileSync(harness, 'export {};');
    for (const source of [scene, config, harness]) utimesSync(source, 1, 1);
    for (const output of [join(dist, 'index.html'), join(route, 'index.html')]) utimesSync(output, 2, 2);

    let server;
    try {
      server = await resolveStaticServer({ tool: 'functional', root });
      expect(await (await fetch(`${server.url}/tests/existing-scene/webgl/`)).text()).toContain('fresh route');
    } finally {
      server?.kill();
      rmSync(root, { recursive: true, force: true });
    }
  });

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
