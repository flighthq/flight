// @vitest-environment node

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

interface BundleSnapshot {
  code: string;
  contributedBytes: ReadonlyMap<string, number>;
  exports: ReadonlySet<string>;
}

interface FormatHandlerFamily {
  isolationSymbols?: readonly string[];
  modules: readonly string[];
  name: string;
  registrar: string;
  symbols: readonly string[];
}

interface FormatParserAssembly {
  exports: readonly string[];
  families: readonly string[];
  name: string;
}

interface FormatParserTreeShakingCase {
  allRegistrar: string;
  contractOnlyExports: readonly string[];
  excludedExports?: readonly string[];
  families: readonly FormatHandlerFamily[];
  fullAssemblies: readonly FormatParserAssembly[];
  leanExports: readonly string[];
  name: string;
  packageDirectory: string;
  publicInfrastructureExports: readonly string[];
}

const GLTF_MATERIAL_MODULES = [
  'gltfAnisotropy.ts',
  'gltfClearcoat.ts',
  'gltfEmissiveStrength.ts',
  'gltfIridescence.ts',
  'gltfMaterialExtension.ts',
  'gltfSheen.ts',
  'gltfSpecular.ts',
  'gltfSpecularGlossiness.ts',
  'gltfTransmissionVolume.ts',
  'gltfUnlit.ts',
] as const;

const GLTF_MATERIAL_HANDLER_SYMBOLS = [
  'GltfAnisotropyExtensionHandler',
  'GltfClearcoatExtensionHandler',
  'GltfEmissiveStrengthExtensionHandler',
  'GltfIridescenceExtensionHandler',
  'GltfSheenExtensionHandler',
  'GltfSpecularExtensionHandler',
  'GltfSpecularGlossinessExtensionHandler',
  'GltfIorExtensionHandler',
  'GltfTransmissionExtensionHandler',
  'GltfVolumeExtensionHandler',
  'GltfUnlitExtensionHandler',
] as const;

const SPINE_SECTION_READER_SYMBOLS = [
  'readSpineBinaryAnimationsSection',
  'readSpineBinaryBonesSection',
  'readSpineBinaryEventsSection',
  'readSpineBinaryIkConstraintsSection',
  'readSpineBinaryPathConstraintsSection',
  'readSpineBinarySkinsSection',
  'readSpineBinarySlotsSection',
  'readSpineBinaryTransformConstraintsSection',
] as const;

const SPINE_TIMELINE_READER_SYMBOLS = [
  'readSpineBinaryBoneTimelines',
  'readSpineBinaryDeformTimelines',
  'readSpineBinaryDrawOrderTimeline',
  'readSpineBinaryEventTimelines',
  'readSpineBinaryIkTimelines',
  'readSpineBinaryPathTimelines',
  'readSpineBinarySlotTimelines',
  'readSpineBinaryTransformTimelines',
] as const;

// SWF is not here. Its families are registry VALUES rather than `register*Handlers` functions, and its
// boundaries are asserted at package reachability rather than at exported-symbol presence, so it has a
// harness of its own in swf-tag-family-tree-shaking.test.ts.
const CASES: readonly FormatParserTreeShakingCase[] = [
  {
    allRegistrar: 'registerAllGltfHandlers',
    contractOnlyExports: [
      'GltfAnimationsCoreFeatureHandler',
      'GltfCamerasCoreFeatureHandler',
      'GltfSkinsCoreFeatureHandler',
      ...GLTF_MATERIAL_HANDLER_SYMBOLS,
      'GltfPunctualLightsExtensionHandler',
    ],
    families: [
      {
        modules: ['gltfAnimations.ts'],
        name: 'animation',
        registrar: 'registerGltfAnimationHandlers',
        symbols: [],
      },
      {
        modules: ['gltfCameras.ts'],
        name: 'camera',
        registrar: 'registerGltfCameraHandlers',
        symbols: [],
      },
      {
        modules: ['gltfSkins.ts'],
        name: 'skin',
        registrar: 'registerGltfSkinHandlers',
        symbols: [],
      },
      {
        modules: GLTF_MATERIAL_MODULES,
        name: 'material extensions',
        registrar: 'registerGltfMaterialExtensionHandlers',
        symbols: [],
      },
      {
        modules: ['gltfPunctualLights.ts'],
        name: 'lighting extensions',
        registrar: 'registerGltfLightingExtensionHandlers',
        symbols: [],
      },
    ],
    fullAssemblies: [
      {
        exports: ['parseGltf'],
        families: ['animation', 'camera', 'skin'],
        name: 'zero-config JSON parser',
      },
      {
        exports: ['parseGlb'],
        families: ['animation', 'camera', 'skin'],
        name: 'zero-config binary parser',
      },
    ],
    leanExports: ['parseGltfWithCoreFeatureHandlers', 'parseGlbWithCoreFeatureHandlers'],
    name: 'glTF',
    packageDirectory: 'scene3d-formats',
    publicInfrastructureExports: ['registerGltfCoreFeatureHandler', 'registerGltfExtensionHandler'],
  },
  {
    allRegistrar: 'registerAllSpineBinaryHandlers',
    contractOnlyExports: [
      'getSpineBinarySectionHandler',
      'getSpineBinaryTimelineHandler',
      'initializeSpineBinaryRegistry',
      'spineBinaryAnimationsSectionHandler',
      'spineBinaryBonesSectionHandler',
      'spineBinaryEventsSectionHandler',
      'spineBinaryIkConstraintsSectionHandler',
      'spineBinaryPathConstraintsSectionHandler',
      'spineBinarySkinsSectionHandler',
      'spineBinarySlotsSectionHandler',
      'spineBinaryTransformConstraintsSectionHandler',
      'spineBinaryBoneTimelineHandler',
      'spineBinaryDeformTimelineHandler',
      'spineBinaryDrawOrderTimelineHandler',
      'spineBinaryEventTimelineHandler',
      'spineBinaryIkTimelineHandler',
      'spineBinaryPathTimelineHandler',
      'spineBinarySlotTimelineHandler',
      'spineBinaryTransformTimelineHandler',
      'unregisterSpineBinarySectionHandler',
      'unregisterSpineBinaryTimelineHandler',
    ],
    families: [
      {
        modules: ['spineBinarySectionHandlers.ts'],
        name: 'sections',
        registrar: 'registerSpineBinarySectionHandlers',
        symbols: SPINE_SECTION_READER_SYMBOLS,
      },
      {
        modules: ['spineBinaryTimelineHandlers.ts'],
        name: 'timelines',
        registrar: 'registerSpineBinaryTimelineHandlers',
        symbols: SPINE_TIMELINE_READER_SYMBOLS,
      },
    ],
    fullAssemblies: [
      {
        exports: ['parseSpineSkeletonBinary'],
        families: ['sections', 'timelines'],
        name: 'zero-config parser',
      },
    ],
    leanExports: ['parseSpineSkeletonBinaryWithRegistry'],
    name: 'Spine binary',
    packageDirectory: 'skeleton2d-formats',
    publicInfrastructureExports: [
      'createSpineBinaryRegistry',
      'registerSpineBinarySectionHandler',
      'registerSpineBinaryTimelineHandler',
    ],
  },
  {
    allRegistrar: 'registerAllRiveHandlers',
    contractOnlyExports: [
      'applyRiveArtboardHandlers',
      'applyRiveClipping',
      'applyRiveDocumentHandlers',
      'applyRiveDrawOrder',
      'applyRiveSolo',
      'createRiveArtboardImportContext',
      'createRiveDocumentImportContext',
      'createRiveFileAssets',
      'createRiveLayoutImports',
      'createRiveSkeleton2D',
      'createRiveStateMachines',
      'getRiveCoreObjectHandler',
      'importRiveCoreObjectAsData',
      'importRiveImageComponent',
      'importRiveLayoutComponent',
      'importRiveNestedArtboardComponent',
      'importRiveNSlicedNodeComponent',
      'importRivePathComponent',
      'importRiveShapeComponent',
      'importRiveSoloComponent',
      'importRiveTextComponent',
      'initializeRiveArtboardImportContext',
      'initializeRiveDocumentImportContext',
      'initializeRiveImportRegistry',
      'rebuildRiveShapes',
    ],
    families: [
      {
        modules: [],
        name: 'shape',
        registrar: 'registerRiveShapeHandlers',
        symbols: ['registerRiveShapeHandlers'],
      },
      {
        modules: [],
        name: 'path',
        registrar: 'registerRivePathHandlers',
        symbols: ['registerRivePathHandlers'],
      },
      {
        modules: [],
        name: 'paint',
        registrar: 'registerRivePaintHandlers',
        symbols: ['registerRivePaintHandlers'],
      },
      {
        modules: [],
        name: 'clipping',
        registrar: 'registerRiveClippingHandlers',
        symbols: ['registerRiveClippingHandlers'],
      },
      {
        modules: [],
        name: 'draw order',
        registrar: 'registerRiveDrawOrderHandlers',
        symbols: ['registerRiveDrawOrderHandlers'],
      },
      {
        modules: [],
        name: 'solo',
        registrar: 'registerRiveSoloHandlers',
        symbols: ['registerRiveSoloHandlers'],
      },
      {
        modules: [],
        name: 'layout',
        registrar: 'registerRiveLayoutHandlers',
        symbols: ['registerRiveLayoutHandlers'],
      },
      {
        modules: [],
        name: 'text',
        registrar: 'registerRiveTextHandlers',
        symbols: ['registerRiveTextHandlers'],
      },
      {
        modules: [],
        name: 'skeleton',
        registrar: 'registerRiveSkeletonHandlers',
        symbols: ['registerRiveSkeletonHandlers'],
      },
      {
        modules: [],
        name: 'state machine',
        registrar: 'registerRiveStateMachineHandlers',
        symbols: ['registerRiveStateMachineHandlers'],
      },
      {
        modules: [],
        name: 'assets',
        registrar: 'registerRiveAssetHandlers',
        symbols: ['registerRiveAssetHandlers'],
      },
    ],
    fullAssemblies: [
      {
        exports: ['createScene2DFromRiveDocument'],
        families: [
          'shape',
          'path',
          'paint',
          'clipping',
          'draw order',
          'solo',
          'layout',
          'text',
          'skeleton',
          'state machine',
          'assets',
        ],
        name: 'zero-config importer',
      },
    ],
    leanExports: ['createRiveDocumentImportResult'],
    name: 'Rive',
    packageDirectory: 'scene2d-formats',
    publicInfrastructureExports: ['createRiveImportRegistry', 'registerRiveCoreObjectHandler'],
  },
];

describe('format parser handler export lanes', () => {
  for (const testCase of CASES) {
    it(`keeps ${testCase.name} handler atoms and low-level registration in contract`, async () => {
      const [publicExports, contractExports] = await Promise.all([
        getEntrypointExports(testCase.packageDirectory, 'index.ts'),
        getEntrypointExports(testCase.packageDirectory, 'contract.ts'),
      ]);
      const intendedPublicExports = [
        ...testCase.publicInfrastructureExports,
        ...testCase.leanExports,
        ...testCase.families.map((family) => family.registrar),
        testCase.allRegistrar,
        ...testCase.fullAssemblies.flatMap((assembly) => assembly.exports),
      ];

      for (const name of intendedPublicExports) {
        expect(publicExports, `${name} public`).toContain(name);
        expect(contractExports, `${name} contract`).toContain(name);
      }
      for (const name of testCase.contractOnlyExports) {
        expect(contractExports, `${name} contract`).toContain(name);
        expect(publicExports, `${name} public`).not.toContain(name);
      }
      for (const name of testCase.excludedExports ?? []) {
        expect(contractExports, `${name} contract`).not.toContain(name);
        expect(publicExports, `${name} public`).not.toContain(name);
      }
      for (const family of testCase.families) expect(family.registrar).toMatch(/Handlers$/);
      expect(testCase.allRegistrar).toMatch(/^registerAll.*Handlers$/);
    });
  }
});

describe('format parser handler tree shaking', () => {
  for (const testCase of CASES) {
    for (const family of testCase.families) {
      it(`isolates the ${testCase.name} ${family.name} family`, async () => {
        const bundle = await bundlePublicExports(testCase.packageDirectory, [family.registrar]);

        expectFamilyReachable(bundle, testCase, family, true);
        for (const sibling of testCase.families) {
          if (sibling === family) continue;
          expectFamilyAbsent(bundle, testCase, sibling, true);
        }
      });
    }

    it(`keeps the ${testCase.name} lean parser independent of built-in handler families`, async () => {
      const bundle = await bundlePublicExports(testCase.packageDirectory, testCase.leanExports);

      for (const family of testCase.families) {
        expectFamilyAbsent(bundle, testCase, family);
        expectFamilyAbsent(bundle, testCase, family, true);
      }
    });

    it(`keeps the ${testCase.name} public registry seams independent of built-in handler families`, async () => {
      const bundle = await bundlePublicExports(testCase.packageDirectory, testCase.publicInfrastructureExports);

      for (const family of testCase.families) {
        expectFamilyAbsent(bundle, testCase, family);
        expectFamilyAbsent(bundle, testCase, family, true);
      }
    });

    it(`makes ${testCase.name} all-handler registration explicit`, async () => {
      const bundle = await bundlePublicExports(testCase.packageDirectory, [testCase.allRegistrar]);

      for (const family of testCase.families) {
        expectFamilyReachable(bundle, testCase, family);
        expectFamilyReachable(bundle, testCase, family, true);
      }
    });

    for (const assembly of testCase.fullAssemblies) {
      it(`preserves the ${testCase.name} ${assembly.name} handler set`, async () => {
        const bundle = await bundlePublicExports(testCase.packageDirectory, assembly.exports);

        for (const family of testCase.families) {
          if (assembly.families.includes(family.name)) expectFamilyReachable(bundle, testCase, family);
          else expectFamilyAbsent(bundle, testCase, family);
        }
      });
    }
  }
});

function expectFamilyAbsent(
  bundle: Readonly<BundleSnapshot>,
  testCase: Readonly<FormatParserTreeShakingCase>,
  family: Readonly<FormatHandlerFamily>,
  isolation = false,
): void {
  for (const module of family.modules) {
    expect(getContributedBytes(bundle, testCase.packageDirectory, module), `${family.name}: ${module}`).toBe(0);
  }
  for (const symbol of isolation ? (family.isolationSymbols ?? family.symbols) : family.symbols) {
    expect(bundle.code.includes(getKeptFunctionNameMarker(symbol)), `${family.name}: ${symbol}`).toBe(false);
  }
}

function expectFamilyReachable(
  bundle: Readonly<BundleSnapshot>,
  testCase: Readonly<FormatParserTreeShakingCase>,
  family: Readonly<FormatHandlerFamily>,
  isolation = false,
): void {
  for (const module of family.modules) {
    expect(getContributedBytes(bundle, testCase.packageDirectory, module), `${family.name}: ${module}`).toBeGreaterThan(
      0,
    );
  }
  for (const symbol of isolation ? (family.isolationSymbols ?? family.symbols) : family.symbols) {
    expect(bundle.code.includes(getKeptFunctionNameMarker(symbol)), `${family.name}: ${symbol}`).toBe(true);
  }
}

function getKeptFunctionNameMarker(symbol: string): string {
  return `,"${symbol}")`;
}

async function bundlePublicExports(packageDirectory: string, names: readonly string[]): Promise<BundleSnapshot> {
  return bundleEntrypoint(packageDirectory, 'index.ts', `export { ${names.join(', ')} } from './index.ts';`);
}

async function getEntrypointExports(packageDirectory: string, entrypoint: string): Promise<readonly string[]> {
  const bundle = await bundleEntrypoint(packageDirectory, entrypoint, `export * from './${entrypoint}';`);
  return [...bundle.exports];
}

async function bundleEntrypoint(
  packageDirectory: string,
  entrypoint: string,
  contents: string,
): Promise<BundleSnapshot> {
  const result = await build({
    bundle: true,
    format: 'esm',
    keepNames: true,
    logLevel: 'silent',
    metafile: true,
    minify: true,
    packages: 'external',
    stdin: {
      contents,
      resolveDir: getPackageSourceDirectory(packageDirectory),
      sourcefile: `${packageDirectory}-${entrypoint}`,
    },
    treeShaking: true,
    write: false,
  });
  const output = Object.values(result.metafile.outputs)[0];
  return {
    code: result.outputFiles[0].text,
    contributedBytes: new Map(
      Object.entries(output.inputs).map(([file, contribution]) => [normalizePath(file), contribution.bytesInOutput]),
    ),
    exports: new Set(output.exports),
  };
}

function getContributedBytes(bundle: Readonly<BundleSnapshot>, packageDirectory: string, module: string): number {
  const suffix = `/packages/${packageDirectory}/src/${module}`;
  for (const [file, bytes] of bundle.contributedBytes) {
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
