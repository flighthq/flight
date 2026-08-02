import { createTransform3D } from '@flighthq/geometry/contract';
import {
  createAmbientLight,
  createAreaLight,
  createDirectionalLight,
  createHemisphereLight,
  createPointLight,
  createSpotLight,
} from '@flighthq/lighting/contract';
import type { Scene3DDocument } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createScene3DLightsFromDocument } from './sceneDocumentLights';

function emptyDocument(): Scene3DDocument {
  return {
    animations: [],
    cameras: [],
    lights: [],
    materials: [],
    meshes: [],
    metadata: null,
    nodes: [],
    resources: [],
    scenes: [],
    skins: [],
  };
}

function placedTransform() {
  const transform = createTransform3D();
  transform.position.x = 10;
  transform.position.y = 20;
  transform.position.z = 30;
  transform.rotation.y = Math.SQRT1_2;
  transform.rotation.w = Math.SQRT1_2;
  transform.scale.x = 2;
  transform.scale.y = 3;
  transform.scale.z = 4;
  return transform;
}

describe('createScene3DLightsFromDocument', () => {
  it('returns a complete empty light set for an empty document', () => {
    const lights = createScene3DLightsFromDocument(emptyDocument());

    expect(lights.ambient).toBeNull();
    expect(lights.directional).toBeNull();
    expect(lights.hemisphere).toEqual([]);
    expect(lights.point).toEqual([]);
    expect(lights.spot).toEqual([]);
  });

  it('clones every representable descriptor and preserves the single-slot document order', () => {
    const document = emptyDocument();
    const transform = createTransform3D();
    const firstAmbient = createAmbientLight({ intensity: 0.25 });
    const firstDirectional = createDirectionalLight({ intensity: 2 });
    const hemisphere = createHemisphereLight({ intensity: 0.5 });
    document.lights.push(
      { descriptor: firstAmbient, transform },
      { descriptor: createAmbientLight({ intensity: 4 }), transform },
      { descriptor: firstDirectional, transform },
      { descriptor: createDirectionalLight({ intensity: 8 }), transform },
      { descriptor: hemisphere, transform },
    );

    const lights = createScene3DLightsFromDocument(document);

    expect(lights.ambient?.intensity).toBe(0.25);
    expect(lights.directional?.intensity).toBe(2);
    expect(lights.hemisphere).toHaveLength(1);
    expect(lights.ambient).not.toBe(firstAmbient);
    expect(lights.directional).not.toBe(firstDirectional);
    expect(lights.hemisphere?.[0]).not.toBe(hemisphere);
  });

  it('resolves point and spot placement plus directional and spot aim into world space', () => {
    const document = emptyDocument();
    const transform = placedTransform();
    const directional = createDirectionalLight({ direction: { x: 0, y: 0, z: -1 } });
    const point = createPointLight({ position: { x: 1, y: 0, z: 0 } });
    const spot = createSpotLight({ direction: { x: 0, y: 0, z: -1 }, position: { x: 1, y: 0, z: 0 } });
    document.lights.push(
      { descriptor: directional, transform },
      { descriptor: point, transform },
      { descriptor: spot, transform },
    );

    const lights = createScene3DLightsFromDocument(document);

    expect(lights.directional?.direction.x).toBeCloseTo(-1);
    expect(lights.directional?.direction.y).toBeCloseTo(0);
    expect(lights.directional?.direction.z).toBeCloseTo(0);
    expect(lights.point?.[0].position).toMatchObject({ x: 10, y: 20, z: 28 });
    expect(lights.spot?.[0].position).toMatchObject({ x: 10, y: 20, z: 28 });
    expect(lights.spot?.[0].direction.x).toBeCloseTo(-1);
    expect(lights.spot?.[0].direction.y).toBeCloseTo(0);
    expect(lights.spot?.[0].direction.z).toBeCloseTo(0);
    expect(directional.direction).toMatchObject({ x: 0, y: 0, z: -1 });
    expect(point.position).toMatchObject({ x: 1, y: 0, z: 0 });
    expect(spot.position).toMatchObject({ x: 1, y: 0, z: 0 });
  });

  it('leaves document-only kinds out when Scene3DLights cannot represent them', () => {
    const document = emptyDocument();
    document.lights.push({ descriptor: createAreaLight(), transform: createTransform3D() });

    const lights = createScene3DLightsFromDocument(document);

    expect(lights.ambient).toBeNull();
    expect(lights.directional).toBeNull();
    expect(lights.hemisphere).toEqual([]);
    expect(lights.point).toEqual([]);
    expect(lights.spot).toEqual([]);
  });
});
