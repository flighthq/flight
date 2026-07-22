import type { DirectionalLight, PointLight, SpotLight } from '@flighthq/types';
import { DirectionalLightKind, PointLightKind, SpotLightKind } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { parseGltf } from './gltfParse';
import { GltfPunctualLightsExtensionHandler } from './gltfPunctualLights';
import type { GltfDocument } from './gltfSchema';

describe('GltfPunctualLightsExtensionHandler', () => {
  it('individually realizes placed directional, point, and spot lights', () => {
    const source: GltfDocument = {
      asset: { version: '2.0' },
      extensions: {
        KHR_lights_punctual: {
          lights: [
            { color: [1, 0, 0], intensity: 2, name: 'sun', type: 'directional' },
            { intensity: 3, range: 10, type: 'point' },
            { spot: { innerConeAngle: 0.25, outerConeAngle: 0.5 }, type: 'spot' },
          ],
        },
      },
      extensionsRequired: ['KHR_lights_punctual'],
      nodes: [
        { extensions: { KHR_lights_punctual: { light: 0 } }, translation: [1, 2, 3] },
        { extensions: { KHR_lights_punctual: { light: 1 } } },
        { extensions: { KHR_lights_punctual: { light: 2 } } },
      ],
      scenes: [{ nodes: [0, 1, 2] }],
    };
    const warnings: string[] = [];
    const document = parseGltf(source, warnings, {
      extensionHandlers: [GltfPunctualLightsExtensionHandler],
    });

    expect(warnings).toEqual([]);
    expect(document.lights).toHaveLength(3);
    const directional = document.lights[0].descriptor as DirectionalLight;
    expect(directional.kind).toBe(DirectionalLightKind);
    expect(directional.intensity).toBe(2);
    expect(directional.color).toBe(0xff0000ff);
    expect(directional.direction).toMatchObject({ x: 0, y: 0, z: -1 });
    expect(document.lights[0]).toMatchObject({ name: 'sun', node: 0 });
    expect(document.lights[0].transform.position).toMatchObject({ x: 1, y: 2, z: 3 });

    const point = document.lights[1].descriptor as PointLight;
    expect(point.kind).toBe(PointLightKind);
    expect(point.intensity).toBe(3);
    expect(point.range).toBe(10);

    const spot = document.lights[2].descriptor as SpotLight;
    expect(spot.kind).toBe(SpotLightKind);
    expect(spot.innerConeCos).toBeCloseTo(Math.cos(0.25));
    expect(spot.outerConeCos).toBeCloseTo(Math.cos(0.5));
  });

  it('is absent unless the caller imports and supplies it', () => {
    const source: GltfDocument = {
      asset: { version: '2.0' },
      extensions: { KHR_lights_punctual: { lights: [{ type: 'point' }] } },
      nodes: [{ extensions: { KHR_lights_punctual: { light: 0 } } }],
      scenes: [{ nodes: [0] }],
    };
    expect(parseGltf(source).lights).toEqual([]);
  });
});
