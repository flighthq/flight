// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

// The AWD2 size fixtures: full (every block family) and static (geometry, materials, scene structure).
// These tests verify the fixture SOURCE exercises the intended handler set, and that the resulting
// bundles include or exclude the expected handler modules and their dependent packages.

const FIXTURES_DIR = resolve(import.meta.dirname, '..', 'tools', 'size', 'fixtures');

const EXCLUDED_FAMILIES = [
  {
    module: 'awd2SkeletonHandler.ts',
    packages: ['animation'],
    sourceImport: 'awd2SkeletonBlockHandler',
    symbol: 'parseSkeletonBlock',
  },
  {
    module: 'awd2LightingHandler.ts',
    packages: ['lighting'],
    sourceImport: 'awd2LightHandler',
    symbol: 'parseLightBlock',
  },
  {
    module: 'awd2CameraHandler.ts',
    packages: ['camera'],
    sourceImport: 'awd2CameraHandler',
    symbol: 'parseCameraBlock',
  },
] as const;

function fixtureSource(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name, 'src', 'render.canvas.ts'), 'utf8');
}

function fixtureMetadata(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(FIXTURES_DIR, name, 'package.json'), 'utf8')) as Record<string, unknown>;
}

async function bundleFixture(
  name: string,
): Promise<{ code: string; packages: Set<string>; modules: Map<string, number> }> {
  const entry = resolve(FIXTURES_DIR, name, 'src', 'render.canvas.ts');
  const result = await build({
    bundle: true,
    entryPoints: [entry],
    format: 'esm',
    keepNames: true,
    logLevel: 'silent',
    metafile: true,
    minify: true,
    treeShaking: true,
    write: false,
  });
  const output = Object.values(result.metafile.outputs)[0];
  const packages = new Set<string>();
  const modules = new Map<string, number>();
  for (const [file, contribution] of Object.entries(output.inputs)) {
    if (contribution.bytesInOutput <= 0) continue;
    const match = /packages\/([^/]+)\/src\/(.+)$/.exec(file.replaceAll('\\', '/'));
    if (match !== null) {
      packages.add(match[1]);
      if (match[1] === 'scene3d-formats') modules.set(match[2], contribution.bytesInOutput);
    }
  }
  return { code: result.outputFiles[0].text, modules, packages };
}

function keptFunctionName(symbol: string): string {
  return `,"${symbol}")`;
}

describe('AWD2 full fixture (awd2-import)', () => {
  it('declares size-only-control metadata', () => {
    const metadata = fixtureMetadata('awd2-import');
    expect(metadata).toMatchObject({ flightSize: { kind: 'size-only-control', name: 'awd2-import' } });
  });

  it('imports parseAwd2 and awd2AllBlockHandlers', () => {
    const source = fixtureSource('awd2-import');
    expect(source).toContain('parseAwd2');
    expect(source).toContain('awd2AllBlockHandlers');
  });

  it('reaches every handler module and family package', async () => {
    const bundle = await bundleFixture('awd2-import');
    expect(bundle.modules.get('awd2BlockRegistry.ts')).toBeGreaterThan(0);
    for (const family of EXCLUDED_FAMILIES) {
      expect(bundle.modules.get(family.module), family.module).toBeGreaterThan(0);
      for (const pkg of family.packages) {
        expect(bundle.packages.has(pkg), `@flighthq/${pkg}`).toBe(true);
      }
    }
  });
});

describe('AWD2 static fixture (awd2-import-static)', () => {
  it('declares size-only-control metadata', () => {
    const metadata = fixtureMetadata('awd2-import-static');
    expect(metadata).toMatchObject({ flightSize: { kind: 'size-only-control', name: 'awd2-import-static' } });
  });

  it('imports parseAwd2 and individual handlers, not the registry', () => {
    const source = fixtureSource('awd2-import-static');
    expect(source).toContain('parseAwd2');
    expect(source).not.toContain('awd2AllBlockHandlers');
    expect(source).toContain('awd2TriangleGeometryHandler');
    expect(source).toContain('awd2ContainerHandler');
    expect(source).toContain('awd2MeshInstanceHandler');
    expect(source).toContain('awd2MaterialHandler');
    expect(source).toContain('awd2TextureHandler');
  });

  it('excludes skeleton, lighting and camera handler imports', () => {
    const source = fixtureSource('awd2-import-static');
    for (const family of EXCLUDED_FAMILIES) {
      expect(source).not.toContain(family.sourceImport);
    }
  });

  it('reaches no animation, lighting or camera package in the bundle', async () => {
    const bundle = await bundleFixture('awd2-import-static');
    for (const family of EXCLUDED_FAMILIES) {
      expect(bundle.modules.get(family.module) ?? 0, family.module).toBe(0);
      for (const pkg of family.packages) {
        expect(bundle.packages.has(pkg), `@flighthq/${pkg}`).toBe(false);
      }
    }
    expect(bundle.modules.get('awd2BlockRegistry.ts') ?? 0).toBe(0);
  });
});

describe('AWD2 fixture differentiation', () => {
  it('full bundle is larger than static by the omitted families', async () => {
    const full = await bundleFixture('awd2-import');
    const staticBundle = await bundleFixture('awd2-import-static');
    expect(full.code.length).toBeGreaterThan(staticBundle.code.length);
    for (const family of EXCLUDED_FAMILIES) {
      expect(full.code.includes(keptFunctionName(family.symbol)), `full has ${family.symbol}`).toBe(true);
      expect(staticBundle.code.includes(keptFunctionName(family.symbol)), `static lacks ${family.symbol}`).toBe(false);
    }
  });
});
