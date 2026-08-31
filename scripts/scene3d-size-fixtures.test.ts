import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

const fixturesRoot = resolve(import.meta.dirname, '..', 'tools', 'size', 'fixtures');
const fixtureSpecs = [
  { backend: 'Gl', name: 'scene3d-gl-untextured-mesh', renderer: 'webgl', textured: false },
  { backend: 'Gl', name: 'scene3d-gl-camera-mesh', renderer: 'webgl', textured: false },
  { backend: 'Gl', name: 'scene3d-gl-textured-mesh', renderer: 'webgl', textured: true },
  { backend: 'Wgpu', name: 'scene3d-wgpu-untextured-mesh', renderer: 'webgpu', textured: false },
  { backend: 'Wgpu', name: 'scene3d-wgpu-camera-mesh', renderer: 'webgpu', textured: false },
  { backend: 'Wgpu', name: 'scene3d-wgpu-textured-mesh', renderer: 'webgpu', textured: true },
] as const;

describe('Scene3D size fixture isolation', () => {
  test.each(fixtureSpecs)('$name is a standalone renderer-specific capture fixture', (spec) => {
    const root = resolve(fixturesRoot, spec.name);
    const packageJson = readJson(resolve(root, 'package.json'));
    const captureManifest = readJson(resolve(root, 'tool-capture.json'));
    const renderFiles = readdirSync(resolve(root, 'src')).filter((name) => name.startsWith('render.'));

    expect(packageJson).toMatchObject({
      flightSize: { name: spec.name },
      name: `${spec.name}-size`,
      private: true,
      type: 'module',
    });
    expect(captureManifest).toEqual({
      entries: [{ name: spec.name, renderers: [spec.renderer], routes: { [spec.renderer]: '/' } }],
      subject: `${spec.name}-size-fixture`,
    });
    expect(renderFiles).toEqual([`render.${spec.renderer}.ts`]);
  });

  test.each(fixtureSpecs)('$name keeps aggregate hosts, pipelines, and registrars out', (spec) => {
    const source = readFileSync(resolve(fixturesRoot, spec.name, 'src', `render.${spec.renderer}.ts`), 'utf8');
    const banned = [
      '@flighthq/sdk',
      'webHost',
      'scene2dGlPipeline',
      'scene2dWgpuPipeline',
      'scene3dGlPipeline',
      'scene3dWgpuPipeline',
      'registerGlUnlitMaterial',
      'registerWgpuUnlitMaterial',
      'registerStandardGlTextureResolvers',
      'registerStandardWgpuTextureResolvers',
    ];

    for (const name of banned) expect(source).not.toContain(name);
    expect(source).toContain(`unlit${spec.backend}MeshMaterialRenderer`);
    expect(source).toContain('meshMaterialRenderers: withRegistryTableEntry(');

    const bitmapResolver = `register${spec.backend}BitmapTextureResolver`;
    expect(source.includes(bitmapResolver)).toBe(spec.textured);
    expect(source.match(new RegExp(`${bitmapResolver}\\(state\\)`, 'g')) ?? []).toHaveLength(spec.textured ? 1 : 0);
  });

  test.each(fixtureSpecs.filter((spec) => spec.name.includes('untextured')))('$name builds one triangle', (spec) => {
    const source = readFileSync(resolve(fixturesRoot, spec.name, 'src', `render.${spec.renderer}.ts`), 'utf8');
    expect(source).toContain('createMeshGeometry({');
    expect(source).not.toContain('createBoxMeshGeometry');
    expect(source).not.toContain('createTexture2D');
  });

  test.each(fixtureSpecs.filter((spec) => spec.name.includes('camera-mesh')))(
    '$name exercises a camera and box mesh',
    (spec) => {
      const source = readFileSync(resolve(fixturesRoot, spec.name, 'src', `render.${spec.renderer}.ts`), 'utf8');
      expect(source).toContain('createBoxMeshGeometry(');
      expect(source).toContain('setCamera3DViewMatrix4FromLookAt(');
      expect(source).not.toContain('createTexture2D');
    },
  );

  test.each(fixtureSpecs.filter((spec) => spec.textured))('$name adds only the bitmap texture path', (spec) => {
    const source = readFileSync(resolve(fixturesRoot, spec.name, 'src', `render.${spec.renderer}.ts`), 'utf8');
    expect(source).toContain('createBitmap(');
    expect(source).toContain('createTexture2D(');
    expect(source).toContain('baseColorMap: texture');
    expect(source).not.toContain('ImageTextureResolver');
    expect(source).not.toContain('RenderTextureResolver');
  });

  test.each(fixtureSpecs.filter((spec) => spec.renderer === 'webgpu'))(
    '$name keeps headless readback outside the measured entry',
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

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}
