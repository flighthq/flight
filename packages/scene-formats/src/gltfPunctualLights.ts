import { packLinearToColor } from '@flighthq/color';
import { createDirectionalLight, createPointLight, createSpotLight } from '@flighthq/lighting';
import type { Light, GltfExtensionHandler, GltfPunctualLight } from '@flighthq/types';

export const GltfPunctualLightsExtensionHandler: GltfExtensionHandler = {
  apply(context) {
    const definitions = context.source.extensions?.KHR_lights_punctual?.lights ?? [];
    const nodes = context.source.nodes ?? [];
    for (let node = 0; node < nodes.length; node++) {
      const lightIndex = nodes[node].extensions?.KHR_lights_punctual?.light;
      if (lightIndex === undefined) continue;
      const source = definitions[lightIndex];
      if (source === undefined) {
        context.warnings?.push(`parseGltf: node ${node} references missing KHR_lights_punctual light ${lightIndex}`);
        continue;
      }
      const descriptor = buildGltfPunctualLight(source, lightIndex, context.warnings);
      if (descriptor === null) continue;
      context.document.lights.push({
        descriptor,
        name: source.name,
        node: context.nodeIndices[node],
        transform: context.buildNodeTransform(node),
      });
    }
  },
  kind: 'KHR_lights_punctual',
};

function buildGltfPunctualLight(source: Readonly<GltfPunctualLight>, index: number, warnings?: string[]): Light | null {
  const color = source.color ?? [1, 1, 1];
  const packedColor = packLinearToColor([color[0] ?? 1, color[1] ?? 1, color[2] ?? 1, 1]);
  const intensity = source.intensity ?? 1;
  if (!(intensity >= 0)) {
    warnings?.push(`parseGltf: KHR_lights_punctual light ${index} has a negative intensity`);
    return null;
  }
  if (source.type === 'directional') {
    return createDirectionalLight({ color: packedColor, direction: { x: 0, y: 0, z: -1 }, intensity });
  }
  const range = source.range ?? -1;
  if (range !== -1 && !(range > 0)) {
    warnings?.push(`parseGltf: KHR_lights_punctual light ${index} has a non-positive range`);
    return null;
  }
  if (source.type === 'point') return createPointLight({ color: packedColor, intensity, range });
  if (source.type === 'spot') {
    const inner = source.spot?.innerConeAngle ?? 0;
    const outer = source.spot?.outerConeAngle ?? Math.PI / 4;
    if (!(inner >= 0) || !(outer > inner) || outer > Math.PI / 2) {
      warnings?.push(`parseGltf: KHR_lights_punctual light ${index} has invalid spot cone angles`);
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
  warnings?.push(`parseGltf: KHR_lights_punctual light ${index} has unsupported type '${source.type}'`);
  return null;
}
