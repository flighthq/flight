// @vitest-environment node

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const resolveDir = import.meta.dirname;

async function bundleRootExport(name: string): Promise<string> {
  const result = await build({
    bundle: true,
    format: 'esm',
    logLevel: 'silent',
    minify: true,
    packages: 'external',
    stdin: {
      contents: `export { ${name} } from './index.ts';`,
      resolveDir,
      sourcefile: `${name}.ts`,
    },
    treeShaking: true,
    write: false,
  });
  return result.outputFiles[0].text;
}

describe('glTF extension tree shaking', () => {
  it('keeps the core parser independent of optional punctual-light realization', async () => {
    const output = await bundleRootExport('parseGltf');
    expect(output).not.toContain('@flighthq/lighting');
    expect(output).not.toContain('KHR_lights_punctual');
  });

  it('includes punctual-light realization only when its named handler is imported', async () => {
    const output = await bundleRootExport('GltfPunctualLightsExtensionHandler');
    expect(output).toContain('DirectionalLight');
    expect(output).toContain('KHR_lights_punctual');
  });
});
