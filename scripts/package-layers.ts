export type PackageLayer = 'core' | 'feature' | 'backend' | 'application' | 'host-tool';

// This is deliberately a central policy rather than package-owned metadata. A package must not
// get to weaken the architectural rule that checks its own dependencies.
const packageNamesByLayer: Readonly<Record<PackageLayer, readonly string[]>> = {
  core: [
    '@flighthq/abc',
    '@flighthq/color',
    '@flighthq/compression',
    '@flighthq/easing',
    '@flighthq/entity',
    '@flighthq/geometry',
    '@flighthq/image-codec',
    '@flighthq/importdiagnostics',
    '@flighthq/layout',
    '@flighthq/math',
    '@flighthq/path',
    '@flighthq/registry',
    '@flighthq/registry-catalog',
    '@flighthq/registry-codegen',
    '@flighthq/requirements',
    '@flighthq/signals',
    '@flighthq/spatial',
    '@flighthq/types',
    '@flighthq/xml',
  ],
  feature: [
    '@flighthq/accessibility',
    '@flighthq/adjustments',
    '@flighthq/animation',
    '@flighthq/assets',
    '@flighthq/audio',
    '@flighthq/binpack',
    '@flighthq/bitmap',
    '@flighthq/bitmapfont',
    '@flighthq/bitmapfont-formats',
    '@flighthq/bitmaptext',
    '@flighthq/camera',
    '@flighthq/camera-controls',
    '@flighthq/capture',
    '@flighthq/clip',
    '@flighthq/clipboard',
    '@flighthq/clock',
    '@flighthq/collision',
    '@flighthq/connectivity',
    '@flighthq/debug',
    '@flighthq/device',
    '@flighthq/dialog',
    '@flighthq/effects',
    '@flighthq/filesystem',
    '@flighthq/flow',
    '@flighthq/font',
    '@flighthq/font-formats',
    '@flighthq/geolocation',
    '@flighthq/glyphatlas',
    '@flighthq/haptics',
    '@flighthq/image',
    '@flighthq/input',
    '@flighthq/interaction',
    '@flighthq/intl',
    '@flighthq/ipc',
    '@flighthq/keyboard',
    '@flighthq/lifecycle',
    '@flighthq/lighting',
    '@flighthq/loader',
    '@flighthq/log',
    '@flighthq/materials',
    '@flighthq/media',
    '@flighthq/mediasession',
    '@flighthq/menu',
    '@flighthq/mesh',
    '@flighthq/motionpath',
    '@flighthq/movieclip',
    '@flighthq/net',
    '@flighthq/node',
    '@flighthq/notification',
    '@flighthq/particleemitter',
    '@flighthq/particles',
    '@flighthq/particles-formats',
    '@flighthq/path-boolean',
    '@flighthq/path-formats',
    '@flighthq/permissions',
    '@flighthq/physics2d',
    '@flighthq/physics3d',
    '@flighthq/physics2d-abi',
    '@flighthq/physics3d-abi',
    '@flighthq/picking',
    '@flighthq/platform',
    '@flighthq/power',
    '@flighthq/protocol',
    '@flighthq/quadbatch',
    '@flighthq/render',
    '@flighthq/scene-document',
    '@flighthq/selection',
    '@flighthq/scene2d',
    '@flighthq/scene2d-formats',
    '@flighthq/scene2d-resources',
    '@flighthq/scene3d',
    '@flighthq/scene3d-formats',
    '@flighthq/scene3d-resources',
    '@flighthq/screen',
    '@flighthq/sensors',
    '@flighthq/shading',
    '@flighthq/shape',
    '@flighthq/shape-formats',
    '@flighthq/share',
    '@flighthq/shell',
    '@flighthq/shortcut',
    '@flighthq/skeleton2d',
    '@flighthq/skeleton2d-formats',
    '@flighthq/skeleton3d',
    '@flighthq/snapshot',
    '@flighthq/socket',
    '@flighthq/spring',
    '@flighthq/statechart',
    '@flighthq/spritesheet',
    '@flighthq/spritesheet-formats',
    '@flighthq/statusbar',
    '@flighthq/storage',
    '@flighthq/swf',
    '@flighthq/text',
    '@flighthq/text-markup',
    '@flighthq/textbidi',
    '@flighthq/textinput',
    '@flighthq/textlayout',
    '@flighthq/textsegment',
    '@flighthq/textshaper',
    '@flighthq/texture',
    '@flighthq/texture-formats',
    '@flighthq/textureatlas',
    '@flighthq/textureatlas-formats',
    '@flighthq/tilemap',
    '@flighthq/tilemap-formats',
    '@flighthq/timeline',
    '@flighthq/tray',
    '@flighthq/tween',
    '@flighthq/updater',
    '@flighthq/useragent',
    '@flighthq/velocity',
    '@flighthq/video',
    '@flighthq/webcam',
  ],
  backend: [
    '@flighthq/effects-canvas',
    '@flighthq/effects-gl',
    '@flighthq/effects-wgpu',
    '@flighthq/render-gl',
    '@flighthq/render-wgpu',
    '@flighthq/scene2d-canvas',
    '@flighthq/scene2d-dom',
    '@flighthq/scene2d-gl',
    '@flighthq/scene2d-wgpu',
    '@flighthq/scene3d-gl',
    '@flighthq/scene3d-wgpu',
    '@flighthq/textshaper-canvas',
  ],
  application: ['@flighthq/app', '@flighthq/application'],
  'host-tool': [
    '@flighthq/application-gl',
    '@flighthq/host-capacitor',
    '@flighthq/host-electron',
    '@flighthq/host-tauri',
    '@flighthq/host-web',
    '@flighthq/sdk',
    '@flighthq/tool-capture',
    '@flighthq/tool-registry',
  ],
};

export interface PackageLayerViolation {
  label: string;
  detail: string;
}

const allowedDependencyLayers: Readonly<Record<PackageLayer, ReadonlySet<PackageLayer>>> = {
  core: new Set(['core']),
  feature: new Set(['core', 'feature']),
  backend: new Set(['core', 'feature', 'backend']),
  application: new Set(['core', 'feature', 'application']),
  'host-tool': new Set(['core', 'feature', 'backend', 'application', 'host-tool']),
};

const layerRuleDescriptions: Readonly<Record<PackageLayer, string>> = {
  core: 'types/core primitives may depend only on types/core primitives',
  feature: 'feature packages may depend only on types/core primitives or feature packages',
  backend: 'backend/renderer packages may depend only on types/core primitives, features, or other backends',
  application: 'application packages may depend only on types/core primitives, features, or other application packages',
  'host-tool': 'host/tool packages may assemble packages from any layer',
};

export const packageLayerByName: ReadonlyMap<string, PackageLayer> = buildPackageLayerMap();

function buildPackageLayerMap(): ReadonlyMap<string, PackageLayer> {
  const layers = new Map<string, PackageLayer>();
  for (const [layer, names] of Object.entries(packageNamesByLayer) as [PackageLayer, readonly string[]][]) {
    for (const name of names) {
      if (layers.has(name)) throw new Error(`${name} is classified in more than one package layer`);
      layers.set(name, layer);
    }
  }
  return layers;
}

export function getPackageLayerCoverageViolations(workspacePackageNames: Iterable<string>): PackageLayerViolation[] {
  const workspace = new Set(workspacePackageNames);
  const violations: PackageLayerViolation[] = [];

  for (const name of [...workspace].sort()) {
    if (!packageLayerByName.has(name)) {
      violations.push({
        label: `${name} has a dependency layer classification`,
        detail: 'add the package to the central table in scripts/package-layers.ts',
      });
    }
  }

  for (const name of [...packageLayerByName.keys()].sort()) {
    if (!workspace.has(name)) {
      violations.push({
        label: `${name} layer classification names a workspace package`,
        detail: 'remove or update the stale entry in scripts/package-layers.ts',
      });
    }
  }

  return violations;
}

// The one sanctioned crossing of the layer rule: a CORE package may depend on `@flighthq/log`, solely so
// its `enable*Guards` module can report through the standard sink instead of a bespoke one.
//
// The rule and this exception coexist because a guard module is SHAKEABLE. The layer rule exists to keep
// core's runtime bundle light and its dependency graph portable; a guard module is separately importable
// and `sideEffects: false`, so it is tree-shaken out of every build that does not import it. Only a caller
// who deliberately asks for diagnostics pulls `@flighthq/log` in — and that caller asked. The manifest
// allowance below is therefore paired with two checks: `getCoreGuardImportViolations` confines the log
// import to guard-module files, and `getCoreGuardRuntimeImportViolations` prevents a core runtime path from
// importing its own guard module. Without both halves this would silently widen into a blanket permission
// or pull the otherwise-shakeable logger into the runtime graph. [chief ruling 2026-07-31; ratified
// 2026-08-07 after the neighbor-package ruling was retracted]
export const CORE_GUARD_LOG_DEPENDENCY = '@flighthq/log';

// Whether `file` is a guard module — the only place a core package may import `@flighthq/log`.
export function isGuardModuleFile(file: string): boolean {
  const base = file.replace(/\\/g, '/').split('/').pop() ?? '';
  return /^enable[A-Za-z0-9]*Guards\.ts$/.test(base);
}

export function isCorePackage(packageName: string): boolean {
  return packageLayerByName.get(packageName) === 'core';
}

export function getPackageLayerDependencyViolation(
  packageName: string,
  dependencyName: string,
): PackageLayerViolation | null {
  const packageLayer = packageLayerByName.get(packageName);
  const dependencyLayer = packageLayerByName.get(dependencyName);
  if (packageLayer === undefined || dependencyLayer === undefined) return null;
  if (allowedDependencyLayers[packageLayer].has(dependencyLayer)) return null;
  // File-scoped guard exception: one check confines the log import to enable*Guards modules, and the other
  // keeps those modules out of core runtime paths.
  if (packageLayer === 'core' && dependencyName === CORE_GUARD_LOG_DEPENDENCY) return null;

  return {
    label: `${dependencyName} obeys the ${packageLayer} dependency-layer rule`,
    detail: `${packageName} (${packageLayer}) -> ${dependencyName} (${dependencyLayer}) is forbidden: ${layerRuleDescriptions[packageLayer]}`,
  };
}

// Whether `file` is a package barrel. A barrel re-exports the guard module by design; that is not the
// guard entering the runtime graph, because `sideEffects: false` lets an unused re-export shake out.
function isBarrelFile(file: string): boolean {
  const base = file.replace(/\\/g, '/').split('/').pop() ?? '';
  return base === 'index.ts' || base === 'contract.ts';
}

// Enforces that a core package's `@flighthq/log` dependency is used ONLY by its guard modules. This is what
// makes the exception file-scoped rather than a blanket allowance: a core runtime file importing the logger
// would put feature-tier weight in the always-loaded graph, which is exactly what the layer rule prevents.
export function getCoreGuardImportViolations(
  packageName: string,
  importsByFile: ReadonlyMap<string, readonly string[]>,
): PackageLayerViolation[] {
  if (!isCorePackage(packageName)) return [];
  const violations: PackageLayerViolation[] = [];
  for (const [file, imports] of importsByFile) {
    if (isGuardModuleFile(file)) continue;
    if (
      !imports.some(
        (specifier) => specifier === CORE_GUARD_LOG_DEPENDENCY || specifier.startsWith(`${CORE_GUARD_LOG_DEPENDENCY}/`),
      )
    ) {
      continue;
    }
    violations.push({
      label: `${packageName} confines its ${CORE_GUARD_LOG_DEPENDENCY} import to guard modules`,
      detail: `${file} imports ${CORE_GUARD_LOG_DEPENDENCY}, but a core package may only do so from an enable*Guards module — the exception is file-scoped precisely so the logger stays out of the always-loaded runtime graph`,
    });
  }
  return violations;
}

// Asserts that no core RUNTIME file imports its own package's guard module. This is the structural reason
// the layer exception costs nothing: if no runtime path references the guard, a bundle that does not
// explicitly import it cannot pull it in — and therefore cannot pull @flighthq/log in either. Barrels are
// exempt, since a re-export shakes out when unused; guard modules may reference each other.
export function getCoreGuardRuntimeImportViolations(
  packageName: string,
  localImportsByFile: ReadonlyMap<string, readonly string[]>,
): PackageLayerViolation[] {
  if (!isCorePackage(packageName)) return [];
  const violations: PackageLayerViolation[] = [];
  for (const [file, imports] of localImportsByFile) {
    if (isGuardModuleFile(file) || isBarrelFile(file)) continue;
    for (const specifier of imports) {
      const target = `${specifier.replace(/\\/g, '/').split('/').pop() ?? ''}.ts`;
      if (!isGuardModuleFile(target)) continue;
      violations.push({
        label: `${packageName} keeps its guard module out of the runtime graph`,
        detail: `${file} imports ${specifier}, but a core runtime file must not reference its own enable*Guards module — that would pull @flighthq/log into every bundle and make the layer exception real weight instead of shakeable`,
      });
    }
  }
  return violations;
}
