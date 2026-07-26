import { packLinearToColor } from '@flighthq/color/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createDirectionalLight, createPointLight, createSpotLight } from '@flighthq/lighting/contract';
import type { Light, GltfExtensionHandler, GltfPunctualLight } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

export const GltfPunctualLightsExtensionHandler: GltfExtensionHandler = {
  apply(context) {
    const definitions = context.source.extensions?.KHR_lights_punctual?.lights ?? [];
    const nodes = context.source.nodes ?? [];
    // Aggregate this handler's per-light faults locally, then flush once into the context's diagnostics
    // array with buildGltfPunctualLight as the origin (the light-building emitter). Handlers own their own
    // aggregation — the context carries the raw crumb array, not the core parser's tally.
    const lightDrops = context.diagnostics ? new Map<string, LightDropTally>() : null;
    for (let node = 0; node < nodes.length; node++) {
      const lightIndex = nodes[node].extensions?.KHR_lights_punctual?.light;
      if (lightIndex === undefined) continue;
      const source = definitions[lightIndex];
      if (source === undefined) {
        tallyLightDrop(lightDrops, ImportDiagnosticSeverity.Drop, 'gltf.light-missing', {
          firstLight: lightIndex,
          firstNode: node,
        });
        continue;
      }
      const descriptor = buildGltfPunctualLight(source, lightIndex, lightDrops);
      if (descriptor === null) continue;
      context.document.lights.push({
        descriptor,
        name: source.name,
        node: context.nodeIndices[node],
        transform: context.buildNodeTransform(node),
      });
    }
    if (lightDrops !== null) {
      for (const tally of lightDrops.values()) {
        reportImportDiagnostic(context.diagnostics, tally.severity, tally.kind, 'buildGltfPunctualLight', {
          ...tally.detail,
          count: tally.count,
        });
      }
    }
  },
  kind: 'KHR_lights_punctual',
};

function buildGltfPunctualLight(
  source: Readonly<GltfPunctualLight>,
  index: number,
  lightDrops: Map<string, LightDropTally> | null,
): Light | null {
  const color = source.color ?? [1, 1, 1];
  const packedColor = packLinearToColor([color[0] ?? 1, color[1] ?? 1, color[2] ?? 1, 1]);
  const intensity = source.intensity ?? 1;
  if (!(intensity >= 0)) {
    tallyLightDrop(lightDrops, ImportDiagnosticSeverity.Drop, 'gltf.light-negative-intensity', {
      firstLight: index,
    });
    return null;
  }
  if (source.type === 'directional') {
    return createDirectionalLight({ color: packedColor, direction: { x: 0, y: 0, z: -1 }, intensity });
  }
  const range = source.range ?? -1;
  if (range !== -1 && !(range > 0)) {
    tallyLightDrop(lightDrops, ImportDiagnosticSeverity.Drop, 'gltf.light-non-positive-range', {
      firstLight: index,
    });
    return null;
  }
  if (source.type === 'point') return createPointLight({ color: packedColor, intensity, range });
  if (source.type === 'spot') {
    const inner = source.spot?.innerConeAngle ?? 0;
    const outer = source.spot?.outerConeAngle ?? Math.PI / 4;
    if (!(inner >= 0) || !(outer > inner) || outer > Math.PI / 2) {
      tallyLightDrop(lightDrops, ImportDiagnosticSeverity.Drop, 'gltf.light-invalid-spot-cone', {
        firstLight: index,
      });
      return null;
    }
    return createSpotLight({
      color: packedColor,
      direction: { x: 0, y: 0, z: -1 },
      innerConeDegrees: (inner * 180) / Math.PI,
      intensity,
      outerConeDegrees: (outer * 180) / Math.PI,
      range,
    });
  }
  tallyLightDrop(lightDrops, ImportDiagnosticSeverity.Skip, 'gltf.light-unsupported-type', {
    firstLight: index,
    firstType: source.type,
  });
  return null;
}

// One accumulated punctual-light drop: total `count` plus the first offender's `detail`, keyed by kind. No
// origin is stored — apply() flushes with buildGltfPunctualLight as the origin.
interface LightDropTally {
  count: number;
  detail: Record<string, boolean | number | string>;
  kind: string;
  severity: ImportDiagnosticSeverity;
}

// Records one offender against its kind tally (each light kind is single-discriminator here). No-op when no
// collector is engaged; keeps the first offender's detail and bumps the count for later ones.
function tallyLightDrop(
  tallies: Map<string, LightDropTally> | null,
  severity: ImportDiagnosticSeverity,
  kind: string,
  firstDetail: Record<string, boolean | number | string>,
): void {
  if (tallies === null) return;
  const existing = tallies.get(kind);
  if (existing === undefined) tallies.set(kind, { count: 1, detail: firstDetail, kind, severity });
  else existing.count++;
}
