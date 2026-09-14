// @vitest-environment node

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

interface FormatParserTreeShakingCase {
  coreExports: readonly string[];
  name: string;
  optionalExports: readonly { module: string; name: string }[];
  packageDirectory: string;
}

const CASES: readonly FormatParserTreeShakingCase[] = [
  {
    coreExports: ['parseGltf'],
    name: 'glTF',
    optionalExports: [
      { module: 'gltfAnisotropy.ts', name: 'GltfAnisotropyExtensionHandler' },
      { module: 'gltfClearcoat.ts', name: 'GltfClearcoatExtensionHandler' },
      { module: 'gltfEmissiveStrength.ts', name: 'GltfEmissiveStrengthExtensionHandler' },
      { module: 'gltfIridescence.ts', name: 'GltfIridescenceExtensionHandler' },
      { module: 'gltfPunctualLights.ts', name: 'GltfPunctualLightsExtensionHandler' },
      { module: 'gltfSheen.ts', name: 'GltfSheenExtensionHandler' },
      { module: 'gltfSpecular.ts', name: 'GltfSpecularExtensionHandler' },
      { module: 'gltfSpecularGlossiness.ts', name: 'GltfSpecularGlossinessExtensionHandler' },
      { module: 'gltfTransmissionVolume.ts', name: 'GltfIorExtensionHandler' },
      { module: 'gltfTransmissionVolume.ts', name: 'GltfTransmissionExtensionHandler' },
      { module: 'gltfUnlit.ts', name: 'GltfUnlitExtensionHandler' },
      { module: 'gltfTransmissionVolume.ts', name: 'GltfVolumeExtensionHandler' },
    ],
    packageDirectory: 'scene3d-formats',
  },
];

describe('format parser tree shaking', () => {
  for (const testCase of CASES) {
    it(`keeps ${testCase.name} optional handlers reachable through the public lane`, async () => {
      const bundle = await bundlePublicExports(
        testCase.packageDirectory,
        testCase.optionalExports.map((entry) => entry.name),
      );

      for (const entry of testCase.optionalExports) {
        expect(getContributedBytes(bundle, testCase.packageDirectory, entry.module), entry.name).toBeGreaterThan(0);
      }
    });

    it(`keeps the ${testCase.name} core parser independent of optional handler modules`, async () => {
      const bundle = await bundlePublicExports(testCase.packageDirectory, testCase.coreExports);

      for (const entry of testCase.optionalExports) {
        expect(getContributedBytes(bundle, testCase.packageDirectory, entry.module), entry.name).toBe(0);
      }
    });
  }
});

async function bundlePublicExports(
  packageDirectory: string,
  names: readonly string[],
): Promise<ReadonlyMap<string, number>> {
  const result = await build({
    bundle: true,
    format: 'esm',
    logLevel: 'silent',
    metafile: true,
    minify: true,
    packages: 'external',
    stdin: {
      contents: `export { ${names.join(', ')} } from './index.ts';`,
      resolveDir: getPackageSourceDirectory(packageDirectory),
      sourcefile: `${packageDirectory}-public-exports.ts`,
    },
    treeShaking: true,
    write: false,
  });
  const output = Object.values(result.metafile.outputs)[0];
  return new Map(
    Object.entries(output.inputs).map(([file, contribution]) => [normalizePath(file), contribution.bytesInOutput]),
  );
}

function getContributedBytes(bundle: ReadonlyMap<string, number>, packageDirectory: string, module: string): number {
  const suffix = `/packages/${packageDirectory}/src/${module}`;
  for (const [file, bytes] of bundle) {
    if (`/${file}`.endsWith(suffix)) return bytes;
  }
  return 0;
}

function getPackageSourceDirectory(packageDirectory: string): string {
  const directory = new URL(`../packages/${packageDirectory}/src/`, import.meta.url);
  const pathname = decodeURIComponent(directory.pathname);
  if (directory.hostname !== '') return `//${directory.hostname}${pathname}`;
  return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
}

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/');
}
