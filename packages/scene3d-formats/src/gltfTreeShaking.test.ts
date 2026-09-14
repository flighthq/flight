// @vitest-environment node

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

import * as publicApi from './index';

const resolveDir = getFileUrlDirectory(import.meta.url);

async function bundleExport(name: string, lane: 'contract' | 'index' = 'contract'): Promise<string> {
  const result = await build({
    bundle: true,
    format: 'esm',
    logLevel: 'silent',
    minify: true,
    packages: 'external',
    stdin: {
      contents: `export { ${name} } from './${lane}.ts';`,
      resolveDir,
      sourcefile: `tree-shake-${name}.ts`,
    },
    treeShaking: true,
    write: false,
  });
  return result.outputFiles[0].text;
}

describe('glTF core feature tree shaking', () => {
  it('keeps the configured parser independent of every optional core handler', async () => {
    const output = await bundleExport('parseGltfWithCoreFeatureHandlers', 'index');

    expect(output).not.toContain('gltf.animation-target-unresolved');
    expect(output).not.toContain('gltf.camera-invalid-perspective');
    expect(output).not.toContain('gltf.skin-ibm-count-mismatch');
  });

  it.each([
    ['registerGltfAnimationHandlers', 'gltf.animation-target-unresolved', 'gltf.camera-invalid-perspective'],
    ['registerGltfCameraHandlers', 'gltf.camera-invalid-perspective', 'gltf.animation-target-unresolved'],
    ['registerGltfLightingExtensionHandlers', 'KHR_lights_punctual', 'KHR_materials_anisotropy'],
    ['registerGltfMaterialExtensionHandlers', 'KHR_materials_anisotropy', 'KHR_lights_punctual'],
    ['registerGltfSkinHandlers', 'gltf.skin-ibm-count-mismatch', 'gltf.animation-target-unresolved'],
  ])('keeps %s independently bundleable', async (name, included, excluded) => {
    const output = await bundleExport(name, 'index');

    expect(output).toContain(included);
    expect(output).not.toContain(excluded);
  });

  it('keeps the all registrar and zero-config parser batteries-included', async () => {
    const allOutput = await bundleExport('registerAllGltfHandlers', 'index');
    expect(allOutput).toContain('gltf.animation-target-unresolved');
    expect(allOutput).toContain('gltf.camera-invalid-perspective');
    expect(allOutput).toContain('gltf.skin-ibm-count-mismatch');
    expect(allOutput).toContain('KHR_materials_anisotropy');
    expect(allOutput).toContain('KHR_lights_punctual');

    const parserOutput = await bundleExport('parseGltf', 'index');
    expect(parserOutput).toContain('gltf.animation-target-unresolved');
    expect(parserOutput).toContain('gltf.camera-invalid-perspective');
    expect(parserOutput).toContain('gltf.skin-ibm-count-mismatch');
    expect(parserOutput).not.toContain('KHR_materials_anisotropy');
    expect(parserOutput).not.toContain('KHR_lights_punctual');
  });
});

describe('glTF extension tree shaking', () => {
  it('keeps the core parser independent of optional punctual-light realization', async () => {
    const output = await bundleExport('parseGltf');
    expect(output).not.toContain('@flighthq/lighting');
    expect(output).not.toContain('KHR_lights_punctual');
  });

  it('includes punctual-light realization only when its named handler is imported', async () => {
    const output = await bundleExport('GltfPunctualLightsExtensionHandler');
    expect(output).toContain('DirectionalLight');
    expect(output).toContain('KHR_lights_punctual');
  });

  it('keeps specific extension handler atoms off the public lane', () => {
    expect('GltfPunctualLightsExtensionHandler' in publicApi).toBe(false);
    expect('GltfAnisotropyExtensionHandler' in publicApi).toBe(false);
  });
});

function getFileUrlDirectory(url: string): string {
  const directory = new URL('.', url);
  const pathname = decodeURIComponent(directory.pathname);
  if (directory.hostname !== '') return `//${directory.hostname}${pathname}`;
  return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
}
