// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const FIXTURES_DIR = resolve(root, 'tools', 'size', 'fixtures');
const RESOURCES_SRC = resolve(root, 'packages', 'scene3d-resources', 'src');

function sourceOf(path: string): string {
  return readFileSync(path, 'utf8');
}

function fixtureSource(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name, 'src', 'render.canvas.ts'), 'utf8');
}

function fixtureMetadata(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(FIXTURES_DIR, name, 'package.json'), 'utf8')) as Record<string, unknown>;
}

async function bundleFixture(name: string): Promise<{ code: string; modules: Map<string, number> }> {
  const entry = resolve(FIXTURES_DIR, name, 'src', 'render.canvas.ts');
  const workspacePackages = [
    { dir: resolve(root, 'packages/scene3d-resources/src'), name: '@flighthq/scene3d-resources' },
    { dir: resolve(root, 'packages/scene3d-formats/src'), name: '@flighthq/scene3d-formats' },
    { dir: resolve(root, 'packages/types/src'), name: '@flighthq/types' },
  ];
  const result = await build({
    bundle: true,
    entryPoints: [entry],
    format: 'esm',
    keepNames: true,
    logLevel: 'silent',
    metafile: true,
    minify: true,
    plugins: [
      {
        name: 'flight-resolve',
        setup(build) {
          build.onResolve({ filter: /^@flighthq\// }, (args) => {
            const pkg = workspacePackages.find((p) => args.path === p.name || args.path.startsWith(`${p.name}/`));
            if (!pkg) return null;
            const subpath = args.path.slice(pkg.name.length);
            return { path: subpath ? `${resolve(pkg.dir, subpath.slice(1))}.ts` : resolve(pkg.dir, 'index.ts') };
          });
        },
      },
    ],
    treeShaking: true,
    write: false,
  });
  const output = Object.values(result.metafile.outputs)[0];
  const modules = new Map<string, number>();
  for (const [file, contribution] of Object.entries(output.inputs)) {
    if (contribution.bytesInOutput <= 0) continue;
    const resourcesMatch = /packages\/scene3d-resources\/src\/(.+)$/.exec(file.replaceAll('\\', '/'));
    if (resourcesMatch !== null) modules.set(`resources:${resourcesMatch[1]}`, contribution.bytesInOutput);
    const formatsMatch = /packages\/scene3d-formats\/src\/(.+)$/.exec(file.replaceAll('\\', '/'));
    if (formatsMatch !== null) modules.set(`formats:${formatsMatch[1]}`, contribution.bytesInOutput);
  }
  return { code: result.outputFiles[0].text, modules };
}

const FAMILY_MARKERS: Readonly<Record<string, string>> = {
  animations: 'gltf.animation-target-unresolved',
  cameras: 'gltf.camera-invalid-perspective',
  skins: 'gltf.skin-ibm-count-mismatch',
};

describe('glTF loader selective module split', () => {
  it('keeps the selective loader module free of every registrar', () => {
    const source = sourceOf(resolve(RESOURCES_SRC, 'gltfLoad.ts'));
    expect(source).not.toContain('registerGltfAnimationHandlers');
    expect(source).not.toContain('registerGltfCameraHandlers');
    expect(source).not.toContain('registerGltfSkinHandlers');
    expect(source).not.toContain('getFullGltfCoreFeatureHandlers');
  });

  it('the zero-config wrapper names all three registrars', () => {
    const source = sourceOf(resolve(RESOURCES_SRC, 'gltfLoadImport.ts'));
    expect(source).toContain('registerGltfAnimationHandlers');
    expect(source).toContain('registerGltfCameraHandlers');
    expect(source).toContain('registerGltfSkinHandlers');
  });
});

describe('gltf-load-import fixture (zero-config loader)', () => {
  it('declares size-only-control metadata', () => {
    const metadata = fixtureMetadata('gltf-load-import');
    expect(metadata).toMatchObject({ flightSize: { kind: 'size-only-control', name: 'gltf-load-import' } });
  });

  it('imports the zero-config loader', () => {
    const source = fixtureSource('gltf-load-import');
    expect(source).toContain('loadScene3DDocumentFromGlbUrl');
    expect(source).not.toContain('WithCoreFeatureHandlers');
  });

  it('reaches the zero-config wrapper and the registrar modules', async () => {
    const bundle = await bundleFixture('gltf-load-import');
    expect(bundle.modules.get('resources:gltfLoadImport.ts')).toBeGreaterThan(0);
    expect(bundle.modules.get('formats:registerGltfAnimationHandlers.ts')).toBeGreaterThan(0);
    expect(bundle.modules.get('formats:registerGltfCameraHandlers.ts')).toBeGreaterThan(0);
    expect(bundle.modules.get('formats:registerGltfSkinHandlers.ts')).toBeGreaterThan(0);
  });

  it('carries all three core family markers', async () => {
    const bundle = await bundleFixture('gltf-load-import');
    for (const [family, marker] of Object.entries(FAMILY_MARKERS)) {
      expect(bundle.code, `${family} marker missing`).toContain(marker);
    }
  });
});

describe('gltf-load-import-core fixture (selective loader)', () => {
  it('declares size-only-control metadata', () => {
    const metadata = fixtureMetadata('gltf-load-import-core');
    expect(metadata).toMatchObject({ flightSize: { kind: 'size-only-control', name: 'gltf-load-import-core' } });
  });

  it('imports the selective loader', () => {
    const source = fixtureSource('gltf-load-import-core');
    expect(source).toContain('loadScene3DDocumentFromGlbUrlWithCoreFeatureHandlers');
  });

  it('does NOT reach the zero-config wrapper or registrar modules', async () => {
    const bundle = await bundleFixture('gltf-load-import-core');
    expect(bundle.modules.get('resources:gltfLoadImport.ts') ?? 0).toBe(0);
    expect(bundle.modules.get('formats:registerGltfAnimationHandlers.ts') ?? 0).toBe(0);
    expect(bundle.modules.get('formats:registerGltfCameraHandlers.ts') ?? 0).toBe(0);
    expect(bundle.modules.get('formats:registerGltfSkinHandlers.ts') ?? 0).toBe(0);
  });

  it('excludes all three core family markers', async () => {
    const bundle = await bundleFixture('gltf-load-import-core');
    for (const [family, marker] of Object.entries(FAMILY_MARKERS)) {
      expect(bundle.code, `${family} marker should be absent`).not.toContain(marker);
    }
  });
});

describe('loader-level fixture differentiation', () => {
  it('zero-config loader bundle is larger than selective by the omitted core families', async () => {
    const full = await bundleFixture('gltf-load-import');
    const selective = await bundleFixture('gltf-load-import-core');
    expect(full.code.length).toBeGreaterThan(selective.code.length);
  });
});
