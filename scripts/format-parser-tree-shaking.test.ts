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

// Every Lottie feature module the decomposition created. Before it, both lists were empty: there was nothing to name
// because every layer and shape item lived in `lottieDocument.ts`.
const LOTTIE_LAYER_MODULES = [
  'lottieImageLayer.ts',
  'lottiePrecompositionLayer.ts',
  'lottieShapeLayer.ts',
  'lottieSolidLayer.ts',
  'lottieTextLayer.ts',
] as const;

const LOTTIE_SHAPE_ITEM_MODULES = [
  'lottieEllipseShapeItem.ts',
  'lottieFillShapeItem.ts',
  'lottieGradientShapeItems.ts',
  'lottiePathShapeItem.ts',
  'lottiePolystarShapeItem.ts',
  'lottieRectangleShapeItem.ts',
  'lottieStrokeShapeItem.ts',
  'lottieTrimPathShapeItem.ts',
] as const;

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

const DRAGONBONES_SECTION_HANDLER_SYMBOLS = [
  'dragonBonesAnimationsSectionHandler',
  'dragonBonesBonesSectionHandler',
  'dragonBonesIkConstraintsSectionHandler',
  'dragonBonesSkinsSectionHandler',
  'dragonBonesSlotsSectionHandler',
] as const;

const DRAGONBONES_TIMELINE_HANDLER_SYMBOLS = [
  'dragonBonesBoneTimelineHandler',
  'dragonBonesDeformTimelineHandler',
  'dragonBonesIkTimelineHandler',
  'dragonBonesSlotTimelineHandler',
  'dragonBonesZOrderTimelineHandler',
] as const;

const SPINE_JSON_SECTION_HANDLER_SYMBOLS = [
  'spineJsonAnimationsSectionHandler',
  'spineJsonBonesSectionHandler',
  'spineJsonEventsSectionHandler',
  'spineJsonIkConstraintsSectionHandler',
  'spineJsonPathConstraintsSectionHandler',
  'spineJsonSkinsSectionHandler',
  'spineJsonSlotsSectionHandler',
  'spineJsonTransformConstraintsSectionHandler',
] as const;

const SPINE_JSON_TIMELINE_HANDLER_SYMBOLS = [
  'spineJsonBoneTimelineHandler',
  'spineJsonDeformTimelineHandler',
  'spineJsonDrawOrderTimelineHandler',
  'spineJsonEventTimelineHandler',
  'spineJsonIkTimelineHandler',
  'spineJsonPathTimelineHandler',
  'spineJsonSlotTimelineHandler',
  'spineJsonTransformTimelineHandler',
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
    allRegistrar: 'registerAllDragonBonesHandlers',
    contractOnlyExports: [
      'dragonBonesAllSectionHandlers',
      'dragonBonesAllTimelineHandlers',
      'dragonBonesAnimationsSectionHandler',
      'dragonBonesBoneTimelineHandler',
      'dragonBonesBonesSectionHandler',
      'dragonBonesDeformTimelineHandler',
      'dragonBonesIkConstraintsSectionHandler',
      'dragonBonesIkTimelineHandler',
      'dragonBonesSkinsSectionHandler',
      'dragonBonesSlotTimelineHandler',
      'dragonBonesSlotsSectionHandler',
      'dragonBonesZOrderTimelineHandler',
      'getDragonBonesSectionHandler',
      'getDragonBonesTimelineHandler',
      'unregisterDragonBonesSectionHandler',
      'unregisterDragonBonesTimelineHandler',
      'DRAGONBONES_REQUIREMENT_KEY_NAMESPACE',
    ],
    excludedExports: [
      'dragonBonesAnimationsSectionReader',
      'dragonBonesBonesSectionReader',
      'dragonBonesBoneTimelineReader',
      'dragonBonesDeformTimelineReader',
      'dragonBonesIkConstraintsSectionReader',
      'dragonBonesIkTimelineReader',
      'dragonBonesSkinsSectionReader',
      'dragonBonesSlotTimelineReader',
      'dragonBonesSlotsSectionReader',
      'dragonBonesZOrderTimelineReader',
    ],
    families: [
      {
        modules: ['dragonBonesSectionHandlers.ts'],
        name: 'sections',
        registrar: 'registerDragonBonesSectionHandlers',
        symbols: DRAGONBONES_SECTION_HANDLER_SYMBOLS,
      },
      {
        modules: ['dragonBonesTimelineHandlers.ts'],
        name: 'timelines',
        registrar: 'registerDragonBonesTimelineHandlers',
        symbols: DRAGONBONES_TIMELINE_HANDLER_SYMBOLS,
      },
    ],
    fullAssemblies: [],
    leanExports: ['parseDragonBonesSkeletonWithRegistry'],
    name: 'DragonBones',
    packageDirectory: 'skeleton2d-formats',
    publicInfrastructureExports: [
      'createDragonBonesRegistry',
      'registerDragonBonesSectionHandler',
      'registerDragonBonesTimelineHandler',
    ],
  },
  {
    allRegistrar: 'registerAllSpineJsonHandlers',
    contractOnlyExports: [
      'getSpineJsonSectionHandler',
      'getSpineJsonTimelineHandler',
      'spineJsonAllSectionHandlers',
      'spineJsonAllTimelineHandlers',
      'spineJsonAnimationsSectionHandler',
      'spineJsonBoneTimelineHandler',
      'spineJsonBonesSectionHandler',
      'spineJsonDeformTimelineHandler',
      'spineJsonDrawOrderTimelineHandler',
      'spineJsonEventTimelineHandler',
      'spineJsonEventsSectionHandler',
      'spineJsonIkConstraintsSectionHandler',
      'spineJsonIkTimelineHandler',
      'spineJsonPathConstraintsSectionHandler',
      'spineJsonPathTimelineHandler',
      'spineJsonSkinsSectionHandler',
      'spineJsonSlotTimelineHandler',
      'spineJsonSlotsSectionHandler',
      'spineJsonTransformConstraintsSectionHandler',
      'spineJsonTransformTimelineHandler',
      'unregisterSpineJsonSectionHandler',
      'unregisterSpineJsonTimelineHandler',
      'SPINE_JSON_REQUIREMENT_KEY_NAMESPACE',
    ],
    families: [
      {
        modules: ['spineJsonSectionHandlers.ts'],
        name: 'sections',
        registrar: 'registerSpineJsonSectionHandlers',
        symbols: SPINE_JSON_SECTION_HANDLER_SYMBOLS,
      },
      {
        modules: ['spineJsonTimelineHandlers.ts'],
        name: 'timelines',
        registrar: 'registerSpineJsonTimelineHandlers',
        symbols: SPINE_JSON_TIMELINE_HANDLER_SYMBOLS,
      },
    ],
    fullAssemblies: [],
    leanExports: ['parseSpineSkeletonWithRegistry'],
    name: 'Spine JSON',
    packageDirectory: 'skeleton2d-formats',
    publicInfrastructureExports: [
      'createSpineJsonRegistry',
      'registerSpineJsonSectionHandler',
      'registerSpineJsonTimelineHandler',
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
  {
    allRegistrar: 'registerAllLottieHandlers',
    // ★ THE FIFTEEN `lottie*Reader` NAMES ARE GONE, AND THAT IS THE POINT. Each was the core's half of a one-line
    // shim: `lottieImageLayerHandler` called `lottieImageLayerReader`, which lived in the 1,800-line document core
    // alongside every other layer and shape item. The handler is now the real function, in the module that owns its
    // interpretation, so there is one identity per feature instead of two.
    contractOnlyExports: ['initializeLottieDocumentImportResult'],
    families: [
      {
        isolationSymbols: ['lottieImageLayerHandler'],
        // `lottieNullLayer.ts` is deliberately absent: a null layer's handler body is empty, so the module
        // contributes no bytes even when it is reachable, and a > 0 assertion on it would be false.
        modules: LOTTIE_LAYER_MODULES,
        name: 'layers',
        registrar: 'registerLottieLayerHandlers',
        symbols: ['lottieImageLayerHandler'],
      },
      {
        isolationSymbols: ['lottieEllipseShapeItemHandler'],
        modules: LOTTIE_SHAPE_ITEM_MODULES,
        name: 'shape items',
        registrar: 'registerLottieShapeItemHandlers',
        symbols: ['lottieEllipseShapeItemHandler'],
      },
    ],
    fullAssemblies: [
      {
        exports: ['createScene2DFromLottieDocument'],
        families: ['layers', 'shape items'],
        name: 'zero-config importer',
      },
    ],
    leanExports: ['applyAnimationClipToLottieDocument'],
    name: 'Lottie',
    packageDirectory: 'scene2d-formats',
    publicInfrastructureExports: [
      // ★ THE SELECTIVE ENTRY IS PUBLIC. It was contract-only while `types` published `LottieRegistry.ts` on its
      // contract lane alone, which made `LottieDocumentImportOptions.layerHandlers` a public option whose element
      // type no application could name. Both lanes now carry the registry, so the selective path is reachable from
      // `@flighthq/sdk` and the size fixtures prove it by naming nothing but `.`.
      'createLottieRegistry',
      'createScene2DFromLottieDocumentWithRegistry',
      'getLottieLayerHandler',
      'getLottieShapeItemHandler',
      'registerLottieLayerHandler',
      'registerLottieShapeItemHandler',
      'unregisterLottieLayerHandler',
      'unregisterLottieShapeItemHandler',
    ],
  },
  {
    allRegistrar: 'registerAllSvgHandlers',
    contractOnlyExports: [
      'svgContainerElementReader',
      'svgGeometryElementReader',
      'svgImageElementReader',
      'svgTextElementReader',
      'svgUseElementReader',
    ],
    families: [
      {
        isolationSymbols: ['svgContainerElementHandler'],
        modules: [],
        name: 'elements',
        registrar: 'registerSvgElementHandlers',
        symbols: ['svgContainerElementReader'],
      },
    ],
    fullAssemblies: [
      {
        exports: ['createScene2DFromSvgDocument'],
        families: ['elements'],
        name: 'zero-config importer',
      },
    ],
    leanExports: ['collectSvgCounts'],
    name: 'SVG',
    packageDirectory: 'scene2d-formats',
    publicInfrastructureExports: [
      'createSvgRegistry',
      'getSvgElementHandler',
      'registerSvgElementHandler',
      'unregisterSvgElementHandler',
    ],
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
