import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

const fixturesRoot = resolve(import.meta.dirname, '..', 'tools', 'size', 'fixtures');
const fixtureSpecs = [
  { backend: 'Gl', feature: 'billboard', name: 'scene3d-gl-billboard', renderer: 'webgl' },
  { backend: 'Gl', feature: 'node', name: 'scene3d-gl-node', renderer: 'webgl' },
  { backend: 'Gl', feature: 'particle-emitter', name: 'scene3d-gl-particle-emitter', renderer: 'webgl' },
  { backend: 'Wgpu', feature: 'billboard', name: 'scene3d-wgpu-billboard', renderer: 'webgpu' },
  { backend: 'Wgpu', feature: 'node', name: 'scene3d-wgpu-node', renderer: 'webgpu' },
  { backend: 'Wgpu', feature: 'particle-emitter', name: 'scene3d-wgpu-particle-emitter', renderer: 'webgpu' },
] as const;

describe('Scene3D second-wave size fixture isolation', () => {
  test.each(fixtureSpecs)('$name declares one backend-specific size entry', (spec) => {
    const root = resolve(fixturesRoot, spec.name);
    const packageJson = readJson(resolve(root, 'package.json'));
    const renderFiles = readdirSync(resolve(root, 'src')).filter((name) => name.startsWith('render.'));

    expect(packageJson).toMatchObject({
      flightSize: { name: spec.name },
      name: `${spec.name}-size`,
      private: true,
      type: 'module',
    });
    expect(renderFiles).toEqual([`render.${spec.renderer}.ts`]);
  });

  test.each(fixtureSpecs.filter((spec) => spec.feature !== 'node'))(
    '$name is a visible capture fixture with one truthful route',
    (spec) => {
      const manifest = readJson(resolve(fixturesRoot, spec.name, 'tool-capture.json'));
      expect(manifest).toEqual({
        entries: [{ name: spec.name, renderers: [spec.renderer], routes: { [spec.renderer]: '/' } }],
        subject: `${spec.name}-size-fixture`,
      });
    },
  );

  test('Node3D size-only controls are backend comparator floors with no renderers or captures', () => {
    for (const spec of fixtureSpecs.filter((item) => item.feature === 'node')) {
      const root = resolve(fixturesRoot, spec.name);
      const packageJson = readJson(resolve(root, 'package.json'));
      const source = readFileSync(resolve(root, 'src', `render.${spec.renderer}.ts`), 'utf8');

      expect(packageJson).toMatchObject({ flightSize: { kind: 'size-only-control', name: spec.name } });
      expect(existsSync(resolve(root, 'tool-capture.json'))).toBe(false);
      expect(source).toContain('createNode3D(Node3DKind)');
      expect(source).toContain(`create${spec.backend}Pipeline(createEmpty${spec.backend}Registries())`);
      expect(source).toContain(`draw${spec.backend}Scene3D(state, scene, camera, lights)`);
      expect(source).not.toMatch(/\bregister(?:Renderer|Renderers)\s*\(/);
      expect(source).not.toContain('meshMaterialRenderers:');
      expect(source).not.toContain('createBillboard(');
      expect(source).not.toContain('createParticleEmitter3D(');

      const controlImports = collectFlightImports(root);
      for (const feature of fixtureSpecs.filter((item) => item.backend === spec.backend && item.feature !== 'node')) {
        const missing = controlImports.filter(
          (specifier) => !collectFlightImports(resolve(fixturesRoot, feature.name)).includes(specifier),
        );
        expect(missing, `${feature.name} must include its ${spec.name} backend floor`).toEqual([]);
      }
    }
  });

  test.each(fixtureSpecs)('$name imports exactly one renderer family', (spec) => {
    const root = resolve(fixturesRoot, spec.name);
    const actual = collectFlightImports(root);
    const backend = spec.renderer === 'webgl' ? 'gl' : 'wgpu';
    const expected = [
      '@flighthq/camera',
      '@flighthq/geometry',
      '@flighthq/host-web',
      '@flighthq/lighting',
      '@flighthq/render',
      `@flighthq/render-${backend}`,
      ...(backend === 'wgpu' ? ['@flighthq/render-wgpu/contract'] : []),
      '@flighthq/scene3d',
      `@flighthq/scene3d-${backend}`,
      ...(spec.feature === 'billboard'
        ? ['@flighthq/materials', '@flighthq/mesh', '@flighthq/node', '@flighthq/registry', '@flighthq/types']
        : spec.feature === 'particle-emitter'
          ? ['@flighthq/node', '@flighthq/particleemitter']
          : []),
      ...(backend === 'wgpu' && spec.feature !== 'node' ? ['@flighthq/tool-capture/browser'] : []),
    ].sort();

    expect(actual).toEqual(expected);
    const source = readFixtureSources(root);
    expect(source).not.toContain('@flighthq/sdk');
    expect(source).not.toContain('@flighthq/scene2d');
    expect(source).not.toMatch(/\bwebHost\b/);
    expect(source).not.toMatch(/\bscene3d(?:Gl|Wgpu)Pipeline\b/);
    if (backend === 'gl') {
      expect(source).not.toContain('@flighthq/render-wgpu');
      expect(source).not.toContain('@flighthq/scene3d-wgpu');
    } else {
      expect(source).not.toContain('@flighthq/render-gl');
      expect(source).not.toContain('@flighthq/scene3d-gl');
    }
  });

  test.each(fixtureSpecs.filter((spec) => spec.feature === 'billboard'))(
    '$name measures only Billboard plus one Unlit mesh realization',
    (spec) => {
      const source = readRenderSource(spec);
      expect(source).toContain('createBillboard(');
      expect(source).toContain("'screenAligned'");
      expect(source).toContain('orientScene3DBillboardsToCamera(scene, camera)');
      expect(source).toContain(`unlit${spec.backend}MeshMaterialRenderer`);
      expect(source).toContain('meshMaterialRenderers: withRegistryTableEntry(');
      expect(source).not.toContain('createMesh(');
      expect(source).not.toContain('createParticleEmitter3D(');
      expect(source).not.toContain('TextureResolver');
    },
  );

  test.each(fixtureSpecs.filter((spec) => spec.feature === 'particle-emitter'))(
    '$name measures the untextured ParticleEmitter3D instanced path',
    (spec) => {
      const source = readRenderSource(spec);
      expect(source).toContain('createParticleEmitter3D()');
      expect(source.match(/appendParticleEmitter3DParticle\(/g)).toHaveLength(3);
      expect(source).toContain(`create${spec.backend}Pipeline(createEmpty${spec.backend}Registries())`);
      expect(source).not.toContain('createMesh(');
      expect(source).not.toContain('createBillboard(');
      expect(source).not.toContain('meshMaterialRenderers:');
      expect(source).not.toContain('MaterialRenderer');
      expect(source).not.toContain('TextureResolver');
    },
  );

  test.each(fixtureSpecs.filter((spec) => spec.renderer === 'webgpu' && spec.feature !== 'node'))(
    '$name keeps WebGPU verifier wiring outside the measured entry',
    (spec) => {
      const root = resolve(fixturesRoot, spec.name);
      const app = readFileSync(resolve(root, 'src', 'app.ts'), 'utf8');
      const capture = readFileSync(resolve(root, 'src', 'capture.ts'), 'utf8');
      const html = readFileSync(resolve(root, 'index.html'), 'utf8');

      expect(app.trim()).toBe("import './render';");
      expect(app).not.toContain('@flighthq/tool-capture');
      expect(capture).toContain("from '@flighthq/tool-capture/browser'");
      expect(capture).toContain("from './render.webgpu'");
      expect(html).toContain('src="/src/app.ts"');
      expect(html).toContain('src="/src/capture.ts"');
    },
  );
});

function collectFlightImports(directory: string): string[] {
  return [
    ...new Set(
      [...readFixtureSources(directory).matchAll(/from\s+['"](@flighthq\/[^'"]+)['"]/g)].map((match) => match[1]),
    ),
  ].sort();
}

function readFixtureSources(directory: string): string {
  return readdirSync(resolve(directory, 'src'))
    .filter((name) => name.endsWith('.ts'))
    .sort()
    .map((name) => readFileSync(resolve(directory, 'src', name), 'utf8'))
    .join('\n');
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function readRenderSource(spec: (typeof fixtureSpecs)[number]): string {
  return readFileSync(resolve(fixturesRoot, spec.name, 'src', `render.${spec.renderer}.ts`), 'utf8');
}
