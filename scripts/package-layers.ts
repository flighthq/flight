export type PackageLayer = 'core' | 'feature' | 'backend' | 'application' | 'host-tool';

// This is deliberately a central policy rather than package-owned metadata. A package must not
// get to weaken the architectural rule that checks its own dependencies.
const packageNamesByLayer: Readonly<Record<PackageLayer, readonly string[]>> = {
  core: [
    '@flighthq/color',
    '@flighthq/easing',
    '@flighthq/entity',
    '@flighthq/geometry',
    '@flighthq/image-codec',
    '@flighthq/importdiagnostics',
    '@flighthq/math',
    '@flighthq/path',
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
    '@flighthq/picking',
    '@flighthq/platform',
    '@flighthq/power',
    '@flighthq/protocol',
    '@flighthq/quadbatch',
    '@flighthq/render',
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
    '@flighthq/spritesheet',
    '@flighthq/spritesheet-formats',
    '@flighthq/statusbar',
    '@flighthq/storage',
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
    '@flighthq/sdk',
    '@flighthq/tool-capture',
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

export function getPackageLayerDependencyViolation(
  packageName: string,
  dependencyName: string,
): PackageLayerViolation | null {
  const packageLayer = packageLayerByName.get(packageName);
  const dependencyLayer = packageLayerByName.get(dependencyName);
  if (packageLayer === undefined || dependencyLayer === undefined) return null;
  if (allowedDependencyLayers[packageLayer].has(dependencyLayer)) return null;

  return {
    label: `${dependencyName} obeys the ${packageLayer} dependency-layer rule`,
    detail: `${packageName} (${packageLayer}) -> ${dependencyName} (${dependencyLayer}) is forbidden: ${layerRuleDescriptions[packageLayer]}`,
  };
}
