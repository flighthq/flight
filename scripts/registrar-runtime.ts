import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createAssetLibrary } from '@flighthq/assets/contract';
import { createPhysics2DWorld } from '@flighthq/physics2d/contract';
import {
  copyAllRenderersFromRenderState,
  copyRenderStateRegistrations,
  createRenderState,
} from '@flighthq/render/contract';
import {
  createCanvasRenderState,
  createCanvasTextureResolvers,
  copyCanvasRenderStateRegistrations,
} from '@flighthq/scene2d-canvas/contract';
import { createDomRenderState, getDomRenderStateRuntime } from '@flighthq/scene2d-dom/contract';
import { createScene2DDocumentImporterRegistry } from '@flighthq/scene2d-resources/contract';
import { createScene3DMaterialTextureRegistry } from '@flighthq/scene3d-resources/contract';
import { createModifierRegistry } from '@flighthq/shading/contract';
import { createMarkupTagRegistry } from '@flighthq/text-markup/contract';
import { JSDOM } from 'jsdom';

import { createGlOffscreenRenderState } from '../packages/render-gl/src/glRenderState';
import { createGlState } from '../packages/render-gl/src/glTestHelper';
import { createWgpuOffscreenRenderState } from '../packages/render-wgpu/src/wgpuRenderState';
import { createWgpuRenderStateForTest, installWgpuMock } from '../packages/render-wgpu/src/wgpuTestHelper';
import {
  collectRegistrarKindConstants,
  collectRegistrarOwnership,
  collectRegistrarRuntimeDeclarations,
} from './reachability-core';
import type {
  RegistrarOwnershipEntry,
  RegistrarRuntimeDeclaration,
  RegistrarRuntimeParameter,
} from './reachability-core';
import {
  captureRegistrarPairs,
  classifyPairDerivation,
  collectRegistrarTableNames,
  describeRuntimeValue,
  explainPairDerivationScope,
  findRegistrarPairCollisions,
} from './registrar-runtime-core';
import type { RegistrarProbeRoot } from './registrar-runtime-core';

interface PreparedArgument {
  derive: (() => unknown | Promise<unknown>) | null;
  deriveNegativeControl: (() => unknown | Promise<unknown>) | null;
  root: RegistrarProbeRoot | null;
  value: unknown;
}

interface RuntimePairResult {
  comparability: 'comparable' | 'instrument-limited' | 'structurally-not-comparable';
  derivation: ReturnType<typeof classifyPairDerivation>;
  derivationReason: ReturnType<typeof explainPairDerivationScope>;
  door: string;
  implementation: string;
  kind: string;
  negativeControl: ReturnType<typeof classifyPairDerivation> | null;
  overwrote: string | null;
  tableShape: 'map' | 'ordered-array';
}

interface RuntimeProbeResult {
  baselineAssertions: readonly { keysBefore: readonly string[]; table: string }[];
  diffedRoots: string[];
  diffedTables: string[];
  outsideDiffedTables: RuntimePairResult[];
  isolation: 'fresh-process-module-instance' | 'fresh-state';
  packageName: string;
  pairs: RuntimePairResult[];
  reason: string | null;
  registrar: string;
  requiredState: string | null;
  status: 'PROBED' | 'PROBED-EMPTY' | 'UNPROBED';
}

interface RuntimeRegistrarClassification {
  mechanismShape: RegistrarOwnershipEntry['mechanismShape'];
  packageName: string;
  parameterCount: number;
  parameterShape: 'argument-taking' | 'no-arguments' | 'state-only';
  registrar: string;
  role: 'assembly' | 'generic-door';
}

interface ModuleGlobalRegistryInventory {
  clear: ModuleGlobalRegistrySeam | null;
  door: string;
  emptyAtImport: boolean;
  enumerate: ModuleGlobalRegistrySeam | null;
  initialization: 'built-ins-at-import' | 'built-ins-on-first-read' | 'empty';
  module: string;
  packageName: string;
  population: 'caller-filled' | 'self-filling';
  read: ModuleGlobalRegistrySeam;
  readerPackages: readonly string[];
  source: string;
  table: string;
  unregister: ModuleGlobalRegistrySeam | null;
}

interface ModuleGlobalRegistrySeam {
  name: string;
  purpose: 'caller-serving' | 'instrument-serving' | 'weak-independent-justification';
}

type CollisionClassification =
  | 'BUILT-IN vs BUILT-IN'
  | 'BUILT-IN vs DELIBERATE OVERRIDE'
  | 'INSTRUMENT ARTIFACT'
  | 'UNCLASSIFIED';

interface CollisionAudit {
  assessment: string;
  classification: CollisionClassification;
  leafValueQualifier: 'satisfied';
}

interface CollisionClaimantMembershipComparison {
  left: string | null;
  leftOnly: string[];
  right: string | null;
  rightOnly: string[];
  sameMembership: boolean;
  shared: string[];
}

const root = process.cwd();
const callerSeam = (name: string): ModuleGlobalRegistrySeam => ({ name, purpose: 'caller-serving' });
const instrumentSeam = (name: string): ModuleGlobalRegistrySeam => ({ name, purpose: 'instrument-serving' });
const weakIndependentSeam = (name: string): ModuleGlobalRegistrySeam => ({
  name,
  purpose: 'weak-independent-justification',
});
const MODULE_GLOBAL_REGISTRIES: readonly ModuleGlobalRegistryInventory[] = [
  {
    clear: null,
    door: 'registerAudioDecoder',
    emptyAtImport: true,
    enumerate: callerSeam('getAudioDecoderMimeTypes'),
    initialization: 'empty',
    module: '@flighthq/audio/contract',
    packageName: 'audio',
    population: 'caller-filled',
    read: callerSeam('getAudioDecoder'),
    readerPackages: ['audio'],
    source: 'packages/audio/src/audioDecoderRegistry.ts',
    table: 'audio decoders',
    unregister: weakIndependentSeam('unregisterAudioDecoder'),
  },
  {
    clear: null,
    door: 'registerDecompressor',
    emptyAtImport: true,
    enumerate: null,
    initialization: 'empty',
    module: '@flighthq/compression/contract',
    packageName: 'compression',
    population: 'caller-filled',
    read: callerSeam('getDecompressor'),
    readerPackages: ['font-formats', 'scene3d-formats', 'swf'],
    source: 'packages/compression/src/decompressor.ts',
    table: 'decompressors',
    unregister: weakIndependentSeam('unregisterDecompressor'),
  },
  {
    clear: null,
    door: 'registerDebugSubsystem',
    emptyAtImport: true,
    enumerate: null,
    initialization: 'empty',
    module: '@flighthq/debug/contract',
    packageName: 'debug',
    population: 'caller-filled',
    read: callerSeam('enableDebug'),
    readerPackages: ['debug'],
    source: 'packages/debug/src/debug.ts',
    table: 'debug subsystems',
    unregister: weakIndependentSeam('unregisterDebugSubsystem'),
  },
  {
    clear: instrumentSeam('clearImageBitmapComposers'),
    door: 'registerImageBitmapComposer',
    emptyAtImport: true,
    enumerate: callerSeam('getImageBitmapComposerKinds'),
    initialization: 'empty',
    module: '@flighthq/image-codec/contract',
    packageName: 'image-codec',
    population: 'caller-filled',
    read: callerSeam('getImageBitmapComposer'),
    readerPackages: ['image', 'image-codec'],
    source: 'packages/image-codec/src/imageBitmapComposerRegistry.ts',
    table: 'image bitmap composers',
    unregister: weakIndependentSeam('unregisterImageBitmapComposer'),
  },
  {
    clear: instrumentSeam('clearImageDecoders'),
    door: 'registerImageDecoder',
    emptyAtImport: true,
    enumerate: callerSeam('getImageDecoderMimeTypes'),
    initialization: 'empty',
    module: '@flighthq/image-codec/contract',
    packageName: 'image-codec',
    population: 'caller-filled',
    read: callerSeam('getImageDecoder'),
    readerPackages: ['image-codec'],
    source: 'packages/image-codec/src/imageDecoderRegistry.ts',
    table: 'image decoders',
    unregister: weakIndependentSeam('unregisterImageDecoder'),
  },
  {
    clear: instrumentSeam('clearImageEncoders'),
    door: 'registerImageEncoder',
    emptyAtImport: true,
    enumerate: callerSeam('getImageEncoderMimeTypes'),
    initialization: 'empty',
    module: '@flighthq/image-codec/contract',
    packageName: 'image-codec',
    population: 'caller-filled',
    read: callerSeam('getImageEncoder'),
    readerPackages: ['image-codec'],
    source: 'packages/image-codec/src/imageEncoderRegistry.ts',
    table: 'image encoders',
    unregister: weakIndependentSeam('unregisterImageEncoder'),
  },
  {
    clear: null,
    door: 'registerHitTest',
    emptyAtImport: true,
    enumerate: null,
    initialization: 'empty',
    module: '@flighthq/interaction/contract',
    packageName: 'interaction',
    population: 'caller-filled',
    read: callerSeam('hitTestGraphPoint'),
    readerPackages: ['interaction'],
    source: 'packages/interaction/src/hitTests.ts',
    table: 'coarse hit tests',
    unregister: null,
  },
  {
    clear: null,
    door: 'registerHitTestPrecise',
    emptyAtImport: true,
    enumerate: null,
    initialization: 'empty',
    module: '@flighthq/interaction/contract',
    packageName: 'interaction',
    population: 'caller-filled',
    read: callerSeam('hitTestGraphPointPrecise'),
    readerPackages: ['interaction'],
    source: 'packages/interaction/src/hitTests.ts',
    table: 'precise hit tests',
    unregister: null,
  },
  {
    clear: instrumentSeam('clearLogSerializers'),
    door: 'registerLogSerializer',
    emptyAtImport: true,
    enumerate: null,
    initialization: 'empty',
    module: '@flighthq/log/contract',
    packageName: 'log',
    population: 'caller-filled',
    read: callerSeam('createJsonLogFormatter'),
    readerPackages: ['log'],
    source: 'packages/log/src/log.ts',
    table: 'log serializers',
    unregister: null,
  },
  {
    clear: null,
    door: 'registerParticleFormat',
    emptyAtImport: true,
    enumerate: callerSeam('getRegisteredParticleFormats'),
    initialization: 'empty',
    module: '@flighthq/particles-formats/contract',
    packageName: 'particles-formats',
    population: 'caller-filled',
    read: callerSeam('getParticleFormatCodec'),
    readerPackages: ['particles-formats'],
    source: 'packages/particles-formats/src/formatRegistry.ts',
    table: 'particle formats',
    unregister: weakIndependentSeam('unregisterParticleFormat'),
  },
  {
    clear: null,
    door: 'registerSkeleton2DAnimationTargetBinder',
    emptyAtImport: true,
    enumerate: callerSeam('getSkeleton2DAnimationTargetBinderKinds'),
    initialization: 'built-ins-on-first-read',
    module: '@flighthq/skeleton2d/contract',
    packageName: 'skeleton2d',
    population: 'self-filling',
    read: callerSeam('getSkeleton2DAnimationTargetBinder'),
    readerPackages: ['skeleton2d'],
    source: 'packages/skeleton2d/src/skeleton2dAnimationTarget.ts',
    table: 'skeleton animation target binders',
    unregister: weakIndependentSeam('unregisterSkeleton2DAnimationTargetBinder'),
  },
  {
    clear: null,
    door: 'registerSkeleton2DConstraintSolver',
    emptyAtImport: true,
    enumerate: null,
    initialization: 'empty',
    module: '@flighthq/skeleton2d/contract',
    packageName: 'skeleton2d',
    population: 'caller-filled',
    read: callerSeam('solveSkeleton2DConstraints'),
    readerPackages: ['skeleton2d'],
    source: 'packages/skeleton2d/src/skeleton2dConstraint.ts',
    table: 'skeleton constraint solvers',
    unregister: weakIndependentSeam('unregisterSkeleton2DConstraintSolver'),
  },
  {
    clear: null,
    door: 'registerSkeleton2DFormat',
    emptyAtImport: true,
    enumerate: callerSeam('getSkeleton2DFormatKinds'),
    initialization: 'built-ins-on-first-read',
    module: '@flighthq/skeleton2d-formats/contract',
    packageName: 'skeleton2d-formats',
    population: 'self-filling',
    read: callerSeam('parseSkeleton2D'),
    readerPackages: ['skeleton2d-formats'],
    source: 'packages/skeleton2d-formats/src/skeletonDetect.ts',
    table: 'skeleton formats',
    unregister: weakIndependentSeam('unregisterSkeleton2DFormat'),
  },
  {
    clear: null,
    door: 'registerSpritesheetFormat',
    emptyAtImport: true,
    enumerate: callerSeam('getSpritesheetFormatKinds'),
    initialization: 'built-ins-on-first-read',
    module: '@flighthq/spritesheet-formats/contract',
    packageName: 'spritesheet-formats',
    population: 'self-filling',
    read: callerSeam('parseSpritesheet'),
    readerPackages: ['spritesheet-formats'],
    source: 'packages/spritesheet-formats/src/spritesheetDetect.ts',
    table: 'spritesheet formats',
    unregister: weakIndependentSeam('unregisterSpritesheetFormat'),
  },
  {
    clear: null,
    door: 'registerTextureAtlasFormat',
    emptyAtImport: true,
    enumerate: callerSeam('getTextureAtlasFormatKinds'),
    initialization: 'built-ins-on-first-read',
    module: '@flighthq/textureatlas-formats/contract',
    packageName: 'textureatlas-formats',
    population: 'self-filling',
    read: callerSeam('parseTextureAtlas'),
    readerPackages: ['textureatlas-formats'],
    source: 'packages/textureatlas-formats/src/textureAtlasDetect.ts',
    table: 'texture-atlas formats',
    unregister: weakIndependentSeam('unregisterTextureAtlasFormat'),
  },
];
const MODULE_GLOBAL_REGISTRY_BY_DOOR = new Map(MODULE_GLOBAL_REGISTRIES.map((entry) => [entry.door, entry]));
const COLLISION_AUDITS = new Map<string, CollisionAudit>([
  [
    collisionKey('registerGlTextureResolver', 'bitmap'),
    instrumentCollision('the standard GL bundle and wrapper reach one leaf with the fixed bitmap pair'),
  ],
  [
    collisionKey('registerGlTextureResolver', 'image'),
    instrumentCollision('the standard GL bundle and wrapper reach one leaf with the fixed image pair'),
  ],
  [
    collisionKey('registerGlTextureResolver', 'renderTarget'),
    instrumentCollision('the standard GL bundle and wrapper reach one leaf with the fixed render-target pair'),
  ],
  [
    collisionKey('registerWgpuTextureResolver', 'bitmap'),
    instrumentCollision('the WGPU bundle, wrapper, and material assemblies reach one leaf with the fixed bitmap pair'),
  ],
  [
    collisionKey('registerWgpuTextureResolver', 'image'),
    instrumentCollision('the WGPU bundle, wrapper, and material assemblies reach one leaf with the fixed image pair'),
  ],
  [
    collisionKey('registerWgpuTextureResolver', 'renderTarget'),
    instrumentCollision(
      'the WGPU bundle, wrapper, and Unlit assembly reach one leaf with the fixed render-target pair',
    ),
  ],
]);

async function main(): Promise<void> {
  const jsonMode = process.argv.includes('--json');
  const checkMode = process.argv.includes('--check');
  installDomAndGpuMocks();

  const singleJsonIndex = process.argv.indexOf('--single-json');
  if (singleJsonIndex !== -1) {
    const requested = JSON.parse(process.argv[singleJsonIndex + 1] ?? '') as {
      declaration: RegistrarRuntimeDeclaration;
      doors: string[];
    };
    console.log(
      JSON.stringify(
        await probeRegistrar(requested.declaration, new Set(requested.doors), 'fresh-process-module-instance'),
      ),
    );
    return;
  }

  const sourceFilesByPackage = new Map(packageNames().map((name) => [name, packageSourceFiles(name)]));
  const allSourceFiles = [...sourceFilesByPackage.values()].flat();
  const constants = collectRegistrarKindConstants(allSourceFiles);
  const declarations = [...sourceFilesByPackage].flatMap(([packageName, sourceFiles]) =>
    collectRegistrarRuntimeDeclarations({ packageName, sourceFiles }),
  );
  const ownership = [...sourceFilesByPackage].flatMap(([packageName, sourceFiles]) =>
    collectRegistrarOwnership({ constants, packageName, sourceFiles }),
  );
  const ownershipByRegistrar = groupOwnership(ownership);
  const classifications = declarations.map((declaration) =>
    classifyRegistrar(declaration, ownershipByRegistrar.get(registrarKey(declaration)) ?? []),
  );
  const classificationByRegistrar = new Map(
    classifications.map((classification) => [registrarKey(classification), classification]),
  );
  const doors = new Set(
    ownership.flatMap((entry) =>
      entry.status === 'catalogued'
        ? entry.door === null
          ? []
          : [entry.door]
        : entry.status === 'mechanism' && entry.mechanismShape === 'caller-supplied-kind'
          ? [entry.registrar]
          : [],
    ),
  );
  const results: RuntimeProbeResult[] = [];

  for (const declaration of declarations) {
    if (classificationByRegistrar.get(registrarKey(declaration))?.role === 'generic-door') continue;
    if (process.argv.includes('--progress')) {
      console.error(`probing ${declaration.packageName}:${declaration.registrar}`);
    }
    results.push(
      requiresFreshModuleInstance(declaration)
        ? probeRegistrarInFreshProcess(declaration, doors)
        : await probeRegistrar(declaration, doors, 'fresh-state'),
    );
  }

  const unprobed = results.filter((result) => result.status === 'UNPROBED');
  const probedEmpty = results.filter((result) => result.status === 'PROBED-EMPTY');
  const lost = results.flatMap((result) => result.pairs).filter((pair) => pair.derivation === 'lost');
  const allPairs = results.flatMap((result) => result.pairs);
  const collisions = findRegistrarPairCollisions(results).map((collision) => {
    const audit = COLLISION_AUDITS.get(collisionKey(collision.door, collision.kind));
    return {
      ...collision,
      assessment: audit?.assessment ?? 'no source audit exists for this collision key',
      classification: audit?.classification ?? ('UNCLASSIFIED' as const),
      implementationRelation:
        new Set(collision.claims.map((claim) => claim.implementation)).size === 1
          ? ('identical' as const)
          : ('different' as const),
      leafValueQualifier: audit?.leafValueQualifier ?? ('not-audited' as const),
    };
  });
  const wgpuBitmapImageClaimantMembership = compareCollisionClaimants(
    collisions.find((collision) => collision.door === 'registerWgpuTextureResolver' && collision.kind === 'bitmap'),
    collisions.find((collision) => collision.door === 'registerWgpuTextureResolver' && collision.kind === 'image'),
  );
  const genericDoors = classifications.filter((classification) => classification.role === 'generic-door');
  const staticGenericDoorMembership = ownership
    .filter((entry) => entry.status === 'mechanism')
    .map(registrarKey)
    .filter((entry, index, entries) => entries.indexOf(entry) === index)
    .sort();
  const runtimeGenericDoorMembership = genericDoors.map(registrarKey).sort();
  const comparablePairs = allPairs.filter((pair) => pair.derivation !== 'not-comparable');
  const notComparablePairs = allPairs.filter((pair) => pair.derivation === 'not-comparable');
  const structurallyNotComparable = notComparablePairs.filter(
    (pair) => pair.comparability === 'structurally-not-comparable',
  );
  const instrumentLimited = notComparablePairs.filter((pair) => pair.comparability === 'instrument-limited');
  const mapNegativeControls = comparablePairs.filter(
    (pair) => pair.tableShape === 'map' && pair.negativeControl !== null,
  );
  const orderedNegativeControls = comparablePairs.filter(
    (pair) => pair.tableShape === 'ordered-array' && pair.negativeControl !== null,
  );
  const summary = {
    registrars: classifications.length,
    assemblies: results.length,
    genericDoors: genericDoors.length,
    stateOnly: classifications.filter((classification) => classification.parameterShape === 'state-only').length,
    argumentTaking: classifications.filter((classification) => classification.parameterShape === 'argument-taking')
      .length,
    noArguments: classifications.filter((classification) => classification.parameterShape === 'no-arguments').length,
    probed: results.filter((result) => result.status === 'PROBED').length,
    probedEmpty: probedEmpty.length,
    unprobed: unprobed.length,
    pairs: allPairs.length,
    collisions: collisions.length,
    comparablePairs: comparablePairs.length,
    survived: comparablePairs.filter((pair) => pair.derivation === 'survived').length,
    lost: lost.length,
    notComparable: notComparablePairs.length,
    assessedPairs: comparablePairs.length + structurallyNotComparable.length,
    structurallyNotComparable: structurallyNotComparable.length,
    instrumentLimited: instrumentLimited.length,
    notComparableReasons: {
      moduleGlobalNoSourceState: notComparablePairs.filter(
        (pair) => pair.derivationReason === 'module-global-no-source-state',
      ).length,
      noDerivedStateAdapter: notComparablePairs.filter((pair) => pair.derivationReason === 'no-derived-state-adapter')
        .length,
    },
    negativeControls: {
      stateAdapter: {
        canFail: mapNegativeControls.length > 0 && mapNegativeControls.every((pair) => pair.negativeControl === 'lost'),
        lost: mapNegativeControls.filter((pair) => pair.negativeControl === 'lost').length,
        pairs: mapNegativeControls.length,
      },
      orderedComparator: {
        canFail:
          orderedNegativeControls.length > 0 &&
          orderedNegativeControls.every((pair) => pair.negativeControl === 'lost'),
        lost: orderedNegativeControls.filter((pair) => pair.negativeControl === 'lost').length,
        pairs: orderedNegativeControls.length,
      },
    },
    collisionClassifications: {
      builtInVsBuiltIn: collisions.filter((collision) => collision.classification === 'BUILT-IN vs BUILT-IN').length,
      builtInVsDeliberateOverride: collisions.filter(
        (collision) => collision.classification === 'BUILT-IN vs DELIBERATE OVERRIDE',
      ).length,
      instrumentArtifact: collisions.filter((collision) => collision.classification === 'INSTRUMENT ARTIFACT').length,
      unclassified: collisions.filter((collision) => collision.classification === 'UNCLASSIFIED').length,
    },
    contestedBindings: collisions.filter((collision) => collision.classification !== 'INSTRUMENT ARTIFACT').length,
  };
  const genericDoorClassification = {
    count: genericDoors.length,
    criterionCount: 1,
    independentOfStaticOwnership: false,
    relationship: 'one static criterion reused by the runtime probe',
    runtimeNotStatic: difference(runtimeGenericDoorMembership, staticGenericDoorMembership),
    sameMembership: arraysEqual(staticGenericDoorMembership, runtimeGenericDoorMembership),
    source: 'collectRegistrarOwnership mechanism rows',
    staticNotRuntime: difference(staticGenericDoorMembership, runtimeGenericDoorMembership),
  };
  const orderSensitivity = {
    reason: 'optional combined sequential pass was not run; collision evidence compares fresh per-registrar sets',
    status: 'NOT-RUN' as const,
  };
  const collisionCoverage = {
    complete: instrumentLimited.length === 0,
    floor: instrumentLimited.length > 0,
    unassessedPairs: instrumentLimited.length,
  };
  const collisionWriterRule = {
    allSixSatisfyQualifier:
      collisions.length === 6 && collisions.every((collision) => collision.leafValueQualifier === 'satisfied'),
    mechanism:
      'the probe attributes a write to every enclosing registrar, so shared helpers appear once per caller; multiplicity is call-stack depth times entry points',
    qualifier: 'every path reaching the leaf must write the identical value',
    unit: 'leaf write site',
    wgpuBitmapImageClaimantMembership,
  };
  const moduleGlobalRegistryCensus = {
    clear: MODULE_GLOBAL_REGISTRIES.filter((entry) => entry.clear !== null).length,
    clearOrUnregister: MODULE_GLOBAL_REGISTRIES.filter((entry) => entry.clear !== null || entry.unregister !== null)
      .length,
    emptyAtImport: MODULE_GLOBAL_REGISTRIES.filter((entry) => entry.emptyAtImport).length,
    enumerate: MODULE_GLOBAL_REGISTRIES.filter((entry) => entry.enumerate !== null).length,
    multiPackageReaders: MODULE_GLOBAL_REGISTRIES.filter((entry) => entry.readerPackages.length > 1).map((entry) => ({
      readerPackages: entry.readerPackages,
      table: entry.table,
    })),
    processWideTier: {
      callerFilledHold: MODULE_GLOBAL_REGISTRIES.filter((entry) => entry.population === 'caller-filled').map(
        (entry) => entry.table,
      ),
      candidateEnumerationConforming: MODULE_GLOBAL_REGISTRIES.filter((entry) => entry.enumerate !== null).map(
        (entry) => entry.table,
      ),
      candidateEnumerationNonConforming: MODULE_GLOBAL_REGISTRIES.filter((entry) => entry.enumerate === null).map(
        (entry) => entry.table,
      ),
      candidateWeakestMembers: MODULE_GLOBAL_REGISTRIES.filter(
        (entry) => entry.enumerate === null && entry.clear === null && entry.unregister === null,
      ).map((entry) => entry.table),
      contract: {
        emptyAtImport: {
          inheritedFrom: 'AGENTS.md:42',
          tierSpecific: false,
        },
        requiredSeams: ['enumerate', 'read', 'clear-or-unregister'],
      },
      discriminator: 'whether the registry module supplies its own defaults',
      importPopulationExceptions: MODULE_GLOBAL_REGISTRIES.filter((entry) => !entry.emptyAtImport).map((entry) => ({
        initialization: entry.initialization,
        ruleViolation: false,
        source: entry.source,
        table: entry.table,
      })),
      readerCountLimitation:
        'readerPackages measures where lookup occurs, not every upstream call site that would have to thread caller-held state',
      selfFilling: MODULE_GLOBAL_REGISTRIES.filter((entry) => entry.population === 'self-filling').map(
        (entry) => entry.table,
      ),
      status: 'SELF-FILLING-DECLARED; CALLER-FILLED-AWAITING-USER',
    },
    read: MODULE_GLOBAL_REGISTRIES.filter((entry) => entry.read !== null).length,
    singlePackageReaders: MODULE_GLOBAL_REGISTRIES.filter((entry) => entry.readerPackages.length === 1).length,
    tables: MODULE_GLOBAL_REGISTRIES.length,
    unregister: MODULE_GLOBAL_REGISTRIES.filter((entry) => entry.unregister !== null).length,
  };

  if (jsonMode) {
    console.log(
      JSON.stringify(
        {
          summary,
          classifications,
          genericDoors,
          genericDoorClassification,
          results,
          collisions,
          collisionCoverage,
          collisionWriterRule,
          orderSensitivity,
          moduleGlobalRegistries: MODULE_GLOBAL_REGISTRIES,
          moduleGlobalRegistryCensus,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `${summary.registrars} registrars: ${summary.assemblies} assemblies, ${summary.genericDoors} generic doors inherited from the static ownership walk; assemblies ${summary.probed} PROBED, ${summary.probedEmpty} PROBED-EMPTY, ${summary.unprobed} UNPROBED`,
    );
    console.log(
      `${summary.lost} lost among ${summary.assessedPairs} assessed pairs (${summary.comparablePairs} compared + ${summary.structurallyNotComparable} correctly not-comparable); ${summary.instrumentLimited} not assessed — probe limitation, not a property of the subject; ${summary.collisions} order-independent collision keys (${collisionCoverage.floor ? 'floor, coverage incomplete' : 'complete coverage'})`,
    );
    for (const result of results) {
      if (result.status !== 'PROBED') {
        console.log(
          `  ${result.status} ${result.packageName}:${result.registrar} [${result.requiredState ?? 'no named state'}] diffed ${formatDiffedTables(result)}${result.reason === null ? '' : ` — ${result.reason}`}`,
        );
        continue;
      }
      for (const pair of result.pairs) {
        console.log(
          `  ${pair.derivation.toUpperCase()} ${result.packageName}:${result.registrar} -> ${pair.door}(${pair.kind}, ${pair.implementation})${pair.overwrote === null ? '' : ` overwrote ${pair.overwrote}`}`,
        );
      }
    }
    for (const collision of collisions) {
      console.log(
        `  COLLISION [${collision.classification}; ${collision.implementationRelation} implementation] ${collision.door}(${collision.kind}) claimed by ${collision.claims.map((claim) => `${claim.packageName}:${claim.registrar}`).join(', ')} — ${collision.assessment}`,
      );
    }
  }

  if (checkMode && (unprobed.length > 0 || probedEmpty.length > 0 || lost.length > 0 || collisions.length > 0)) {
    process.exitCode = 1;
  }
}

async function probeRegistrar(
  declaration: RegistrarRuntimeDeclaration,
  directDoors: ReadonlySet<string>,
  isolation: RuntimeProbeResult['isolation'],
): Promise<RuntimeProbeResult> {
  const prepared: PreparedArgument[] = [];
  try {
    for (const parameter of declaration.parameters) prepared.push(await prepareArgument(declaration, parameter));
    const baselineAssertions = isolation === 'fresh-process-module-instance' ? await assertModuleGlobalBaselines() : [];
    const module = (await import(pathToFileURL(declaration.sourceFile).href)) as Record<string, unknown>;
    const registrar = module[declaration.registrar];
    if (typeof registrar !== 'function') throw new Error('export is not a runtime function');
    const captured = await captureRegistrarPairs(directDoors, () =>
      registrar(...prepared.map((argument) => argument.value)),
    );
    const roots = prepared.flatMap((argument) => (argument.root === null ? [] : [argument.root]));
    const tableNames = collectRegistrarTableNames(roots);
    const blindModuleGlobal = captured.filter((pair) => {
      const inventory = MODULE_GLOBAL_REGISTRY_BY_DOOR.get(pair.door);
      return !tableNames.has(pair.table) && !pair.weakMapOwned && inventory?.enumerate == null;
    });
    const visible = captured.filter((pair) => {
      const inventory = MODULE_GLOBAL_REGISTRY_BY_DOOR.get(pair.door);
      return tableNames.has(pair.table) || (!pair.weakMapOwned && inventory?.enumerate != null);
    });
    const outside = captured.filter((pair) => !tableNames.has(pair.table) && pair.weakMapOwned);
    const stateArgument = prepared.find((argument) => argument.root !== null) ?? null;
    const derivedState = stateArgument?.derive === null ? null : await stateArgument?.derive();
    const negativeControlState =
      stateArgument?.deriveNegativeControl == null ? null : await stateArgument.deriveNegativeControl();
    const pairResult = (pair: (typeof captured)[number]): RuntimePairResult => ({
      comparability: pairComparability(
        explainPairDerivationScope(pair, stateArgument?.root?.value ?? null, asObject(derivedState)),
      ),
      derivation: classifyPairDerivation(pair, stateArgument?.root?.value ?? null, asObject(derivedState)),
      door: pair.door,
      implementation: describeRuntimeValue(pair.value),
      kind: describeRuntimeValue(pair.key),
      negativeControl:
        negativeControlState === null
          ? null
          : classifyPairDerivation(pair, stateArgument?.root?.value ?? null, asObject(negativeControlState)),
      overwrote: pair.hadPrevious ? describeRuntimeValue(pair.previous) : null,
      derivationReason: explainPairDerivationScope(pair, stateArgument?.root?.value ?? null, asObject(derivedState)),
      tableShape: pair.table instanceof Map ? 'map' : 'ordered-array',
    });
    const diffedTables = new Set(tableNames.values());
    for (const pair of visible) {
      if (!tableNames.has(pair.table)) diffedTables.add(`<private Map behind ${pair.door}>`);
    }
    return {
      baselineAssertions,
      diffedRoots: roots.map((root) => root.label),
      diffedTables: [...diffedTables].sort(),
      outsideDiffedTables: outside.map(pairResult),
      isolation,
      packageName: declaration.packageName,
      pairs: visible.map(pairResult),
      reason:
        blindModuleGlobal.length > 0
          ? `${blindModuleGlobal.length} captured write${blindModuleGlobal.length === 1 ? '' : 's'} targeted a module-global registry without an enumeration seam`
          : outside.length === 0
            ? null
            : `${outside.length} write${outside.length === 1 ? '' : 's'} landed only in WeakMap-owned tables outside the diff roots`,
      registrar: declaration.registrar,
      requiredState: requiredStateName(declaration.parameters),
      status: blindModuleGlobal.length > 0 ? 'UNPROBED' : visible.length === 0 ? 'PROBED-EMPTY' : 'PROBED',
    };
  } catch (error) {
    const roots = prepared.flatMap((argument) => (argument.root === null ? [] : [argument.root]));
    return {
      baselineAssertions: [],
      diffedRoots: roots.map((root) => root.label),
      diffedTables: [...collectRegistrarTableNames(roots).values()].sort(),
      outsideDiffedTables: [],
      isolation,
      packageName: declaration.packageName,
      pairs: [],
      reason: error instanceof Error ? error.message : String(error),
      registrar: declaration.registrar,
      requiredState: requiredStateName(declaration.parameters),
      status: 'UNPROBED',
    };
  }
}

async function prepareArgument(
  declaration: RegistrarRuntimeDeclaration,
  parameter: RegistrarRuntimeParameter,
): Promise<PreparedArgument> {
  const types = new Set(parameter.typeNames);
  if (parameter.defaulted) return plainArgument(undefined);
  if (types.has('GlRenderState')) {
    const state = createGlState().state;
    return rootArgument(
      parameter,
      state,
      () => createGlOffscreenRenderState(state),
      () => createGlState().state,
    );
  }
  if (types.has('WgpuRenderState')) {
    const state = await createWgpuRenderStateForTest();
    return rootArgument(parameter, state, () => createWgpuOffscreenRenderState(state), createWgpuRenderStateForTest);
  }
  if (types.has('CanvasRenderState')) {
    const state = createCanvasProbeState();
    return rootArgument(
      parameter,
      state,
      () => {
        const derived = createCanvasProbeState();
        copyCanvasRenderStateRegistrations(derived, state);
        copyAllRenderersFromRenderState(derived, state);
        return derived;
      },
      createCanvasProbeState,
    );
  }
  if (types.has('RenderState')) {
    const state = createRenderState();
    return rootArgument(
      parameter,
      state,
      () => {
        const derived = createRenderState();
        copyRenderStateRegistrations(derived, state);
        copyAllRenderersFromRenderState(derived, state);
        return derived;
      },
      createRenderState,
    );
  }
  if (types.has('DomRenderState')) {
    const state = createDomRenderState(document.createElement('div'));
    return rootArgument(
      parameter,
      state,
      () => deriveDomProbeState(state),
      () => createDomRenderState(document.createElement('div')),
    );
  }
  if (types.has('CanvasTextureResolvers')) {
    const state = createCanvasTextureResolversForProbe();
    return rootArgument(
      parameter,
      state,
      () => deriveCanvasTextureResolvers(state),
      createCanvasTextureResolversForProbe,
    );
  }
  if (types.has('Scene3DMaterialTextureRegistry')) {
    const state = createScene3DMaterialTextureRegistry();
    return rootArgument(
      parameter,
      state,
      () => deriveScene3DMaterialTextureRegistry(state),
      createScene3DMaterialTextureRegistry,
    );
  }
  if (types.has('Scene2DDocumentImporterRegistry')) {
    const state = createScene2DDocumentImporterRegistry();
    return rootArgument(
      parameter,
      state,
      () => deriveScene2DDocumentImporterRegistry(state),
      createScene2DDocumentImporterRegistry,
    );
  }
  if (types.has('ModifierRegistry')) {
    const state = createModifierRegistry();
    return rootArgument(parameter, state, () => deriveModifierRegistry(state), createModifierRegistry);
  }
  if (types.has('MarkupTagRegistry')) {
    const state = createMarkupTagRegistry();
    return rootArgument(parameter, state, () => deriveMarkupTagRegistry(state), createMarkupTagRegistry);
  }
  if (types.has('Physics2DWorld')) {
    const state = createPhysics2DWorld();
    return rootArgument(parameter, state, () => derivePhysics2DWorld(state), createPhysics2DWorld);
  }
  if (types.has('AssetLibrary')) return rootArgument(parameter, createAssetLibrary(), null, null);
  if (types.has('string') || /kind|name|type|scheme|accelerator/i.test(parameter.name)) {
    return plainArgument(`__probe_${parameter.name}__`);
  }
  if (types.has('number')) return plainArgument(1);
  if (types.has('boolean')) return plainArgument(true);
  throw new Error(
    `no argument adapter for ${declaration.registrar}.${parameter.name}: ${parameter.typeNames.join(' | ') || 'untyped'}`,
  );
}

function requiredStateName(parameters: readonly RegistrarRuntimeParameter[]): string | null {
  for (const parameter of parameters) {
    const name = parameter.typeNames.find((type) => /(?:State|Registry|Resolvers|World|Library)$/.test(type));
    if (name !== undefined) return name;
  }
  return null;
}

function classifyRegistrar(
  declaration: RegistrarRuntimeDeclaration,
  rows: readonly RegistrarOwnershipEntry[],
): RuntimeRegistrarClassification {
  const mechanism = rows.find((row) => row.status === 'mechanism') ?? null;
  const requiredState = requiredStateName(declaration.parameters);
  return {
    mechanismShape: mechanism?.mechanismShape ?? null,
    packageName: declaration.packageName,
    parameterCount: declaration.parameters.length,
    parameterShape:
      declaration.parameters.length === 0
        ? 'no-arguments'
        : declaration.parameters.length === 1 && requiredState !== null
          ? 'state-only'
          : 'argument-taking',
    registrar: declaration.registrar,
    role: mechanism === null ? 'assembly' : 'generic-door',
  };
}

function requiresFreshModuleInstance(declaration: RegistrarRuntimeDeclaration): boolean {
  return declaration.parameters.length === 0 || declaration.parameters.every((parameter) => parameter.defaulted);
}

async function assertModuleGlobalBaselines(): Promise<readonly { keysBefore: readonly string[]; table: string }[]> {
  const assertions: { keysBefore: readonly string[]; table: string }[] = [];
  for (const entry of MODULE_GLOBAL_REGISTRIES) {
    // Enumerating a self-filling lazy table is itself its first read and therefore seeds its defaults.
    // The runtime baseline assertion can observe only registries whose declared initial state stays empty;
    // the independent top-level-side-effect scan covers lazy self-filling modules at import time.
    if (entry.enumerate === null || !entry.emptyAtImport || entry.initialization !== 'empty') continue;
    const module = (await import(entry.module)) as Record<string, unknown>;
    const enumerate = module[entry.enumerate.name];
    if (typeof enumerate !== 'function') throw new Error(`${entry.table}: enumeration seam is not exported`);
    const keys = (enumerate as () => readonly unknown[])().map(describeRuntimeValue);
    if (keys.length > 0) throw new Error(`${entry.table}: expected empty-at-import baseline, found ${keys.join(', ')}`);
    assertions.push({ keysBefore: keys, table: entry.table });
  }
  return assertions;
}

function probeRegistrarInFreshProcess(
  declaration: RegistrarRuntimeDeclaration,
  doors: ReadonlySet<string>,
): RuntimeProbeResult {
  const scriptPath = process.argv[1];
  if (scriptPath === undefined) throw new Error('Cannot locate registrar runtime script');
  const child = spawnSync(
    process.execPath,
    [
      ...process.execArgv,
      scriptPath,
      '--single-json',
      JSON.stringify({
        declaration,
        doors: [...doors],
      }),
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 30_000 },
  );
  if (child.status !== 0) {
    return {
      baselineAssertions: [],
      diffedRoots: [],
      diffedTables: [],
      isolation: 'fresh-process-module-instance',
      outsideDiffedTables: [],
      packageName: declaration.packageName,
      pairs: [],
      reason: child.stderr.trim() || `fresh process exited ${child.status ?? 'without a status'}`,
      registrar: declaration.registrar,
      requiredState: requiredStateName(declaration.parameters),
      status: 'UNPROBED',
    };
  }
  try {
    return JSON.parse(child.stdout) as RuntimeProbeResult;
  } catch (error) {
    return {
      baselineAssertions: [],
      diffedRoots: [],
      diffedTables: [],
      isolation: 'fresh-process-module-instance',
      outsideDiffedTables: [],
      packageName: declaration.packageName,
      pairs: [],
      reason: `fresh process returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      registrar: declaration.registrar,
      requiredState: requiredStateName(declaration.parameters),
      status: 'UNPROBED',
    };
  }
}

function formatDiffedTables(result: RuntimeProbeResult): string {
  if (result.diffedTables.length > 0) return result.diffedTables.join(', ');
  if (result.diffedRoots.length > 0) return `${result.diffedRoots.join(', ')} (no reachable Map tables)`;
  return 'no observable Map table';
}

function plainArgument(value: unknown): PreparedArgument {
  return { derive: null, deriveNegativeControl: null, root: null, value };
}

function rootArgument(
  parameter: RegistrarRuntimeParameter,
  value: object,
  derive: (() => unknown | Promise<unknown>) | null,
  deriveNegativeControl: (() => unknown | Promise<unknown>) | null,
): PreparedArgument {
  return {
    derive,
    deriveNegativeControl,
    root: { label: `${parameter.name}:${parameter.typeNames.join('|') || '<untyped>'}`, value },
    value,
  };
}

function asObject(value: unknown): object | null {
  return typeof value === 'object' && value !== null ? value : null;
}

function collisionKey(door: string, kind: string): string {
  return `${door}\0${kind}`;
}

function compareCollisionClaimants(
  left:
    | {
        claims: readonly { packageName: string; registrar: string }[];
        door: string;
        kind: string;
      }
    | undefined,
  right:
    | {
        claims: readonly { packageName: string; registrar: string }[];
        door: string;
        kind: string;
      }
    | undefined,
): CollisionClaimantMembershipComparison {
  const leftClaimants = left?.claims.map(collisionClaimantKey).sort() ?? [];
  const rightClaimants = right?.claims.map(collisionClaimantKey).sort() ?? [];
  return {
    left: left === undefined ? null : `${left.door}(${left.kind})`,
    leftOnly: difference(leftClaimants, rightClaimants),
    right: right === undefined ? null : `${right.door}(${right.kind})`,
    rightOnly: difference(rightClaimants, leftClaimants),
    sameMembership: arraysEqual(leftClaimants, rightClaimants),
    shared: leftClaimants.filter((claimant) => rightClaimants.includes(claimant)),
  };
}

function collisionClaimantKey(claim: { packageName: string; registrar: string }): string {
  return `${claim.packageName}:${claim.registrar}`;
}

function instrumentCollision(assessment: string): CollisionAudit {
  return { assessment, classification: 'INSTRUMENT ARTIFACT', leafValueQualifier: 'satisfied' };
}

function pairComparability(reason: ReturnType<typeof explainPairDerivationScope>): RuntimePairResult['comparability'] {
  if (reason === null) return 'comparable';
  return reason === 'module-global-no-source-state' ? 'structurally-not-comparable' : 'instrument-limited';
}

function difference(left: readonly string[], right: readonly string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((entry) => !rightSet.has(entry));
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function registrarKey(entry: Pick<RegistrarOwnershipEntry, 'packageName' | 'registrar'>): string {
  return `${entry.packageName}\0${entry.registrar}`;
}

function groupOwnership(entries: readonly RegistrarOwnershipEntry[]): Map<string, RegistrarOwnershipEntry[]> {
  const grouped = new Map<string, RegistrarOwnershipEntry[]>();
  for (const entry of entries) {
    const key = registrarKey(entry);
    const group = grouped.get(key) ?? [];
    group.push(entry);
    grouped.set(key, group);
  }
  return grouped;
}

function packageNames(): string[] {
  return readdirSync(join(root, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function packageSourceFiles(packageName: string): string[] {
  const sourceDir = join(root, 'packages', packageName, 'src');
  if (!existsSync(sourceDir)) return [];
  return readdirSync(sourceDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.ts') &&
        entry.name !== 'index.ts' &&
        entry.name !== 'contract.ts' &&
        !entry.name.endsWith('.test.ts'),
    )
    .map((entry) => join(sourceDir, entry.name));
}

function createCanvasProbeState() {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'getContext', { value: () => canvas2DContext });
  return createCanvasRenderState(canvas);
}

function createCanvasTextureResolversForProbe() {
  const resolvers = createCanvasTextureResolvers();
  resolvers.registry = new Map();
  return resolvers;
}

function deriveCanvasTextureResolvers(source: ReturnType<typeof createCanvasTextureResolversForProbe>) {
  const derived = createCanvasTextureResolversForProbe();
  derived.registry = copyNullableMap(source.registry);
  derived.registryMiss = source.registryMiss;
  return derived;
}

function deriveDomProbeState(source: ReturnType<typeof createDomRenderState>) {
  const derived = createDomRenderState(document.createElement('div'));
  copyRenderStateRegistrations(derived, source);
  copyAllRenderersFromRenderState(derived, source);
  const sourceRuntime = getDomRenderStateRuntime(source);
  const derivedRuntime = getDomRenderStateRuntime(derived);
  derivedRuntime.registries = {
    renderers: derivedRuntime.registries.renderers,
    shapeRasterizer: sourceRuntime.registries.shapeRasterizer,
    strokeTessellator: sourceRuntime.registries.strokeTessellator,
    textureResolvers: sourceRuntime.registries.textureResolvers,
  };
  return derived;
}

function deriveMarkupTagRegistry(source: ReturnType<typeof createMarkupTagRegistry>) {
  const derived = createMarkupTagRegistry();
  derived.classResolver = source.classResolver;
  derived.colorResolver = source.colorResolver;
  derived.handlers = new Map(source.handlers);
  return derived;
}

function deriveModifierRegistry(source: ReturnType<typeof createModifierRegistry>) {
  const derived = createModifierRegistry();
  derived.definitions = new Map(source.definitions);
  return derived;
}

function derivePhysics2DWorld(source: ReturnType<typeof createPhysics2DWorld>) {
  const derived = createPhysics2DWorld(source.gravityX, source.gravityY);
  derived.jointSolvers = new Map(source.jointSolvers);
  return derived;
}

function deriveScene2DDocumentImporterRegistry(source: ReturnType<typeof createScene2DDocumentImporterRegistry>) {
  const derived = createScene2DDocumentImporterRegistry();
  derived.entries = [...source.entries];
  return derived;
}

function deriveScene3DMaterialTextureRegistry(source: ReturnType<typeof createScene3DMaterialTextureRegistry>) {
  const derived = createScene3DMaterialTextureRegistry();
  derived.extensionListers = new Map(source.extensionListers);
  derived.listers = new Map(source.listers);
  return derived;
}

function copyNullableMap<K, V>(source: Map<K, V> | null | undefined): Map<K, V> | null | undefined {
  return source == null ? source : new Map(source);
}

function installDomAndGpuMocks(): void {
  const window = new JSDOM('<!doctype html><html><body></body></html>').window;
  for (const name of [
    'document',
    'HTMLElement',
    'HTMLCanvasElement',
    'HTMLImageElement',
    'ImageData',
    'navigator',
    'Node',
  ] as const) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: window[name],
      writable: true,
    });
  }
  Object.defineProperty(globalThis, 'vi', {
    configurable: true,
    value: { fn: () => () => undefined },
  });
  const gl = new Proxy(
    {},
    {
      get: (_target, property) =>
        typeof property === 'string' && property === property.toUpperCase() ? 0 : () => null,
    },
  );
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  (HTMLCanvasElement.prototype as { getContext: unknown }).getContext = function (
    this: HTMLCanvasElement,
    contextId: string,
    options?: unknown,
  ) {
    if (contextId === '2d') return canvas2DContext;
    if (contextId === 'webgl2') return gl;
    return Reflect.apply(originalGetContext, this, [contextId, options]);
  };
  installWgpuMock();
}

const canvas2DContext = new Proxy(
  { getContextAttributes: () => ({}) },
  { get: (target, property) => Reflect.get(target, property) ?? (() => undefined) },
) as unknown as CanvasRenderingContext2D;

await main();
