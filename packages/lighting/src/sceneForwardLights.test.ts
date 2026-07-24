import { createBoundingSphere } from '@flighthq/geometry';
import type { SceneForwardLightSelection, SceneLightsLike } from '@flighthq/types';

import { createPointLight } from './pointLight';
import { selectSceneForwardLights } from './sceneForwardLights';
import { createSpotLight } from './spotLight';

function selection(): SceneForwardLightSelection {
  return { indices: [], point: [], spot: [] };
}

describe('selectSceneForwardLights', () => {
  it('selects the four strongest point and spot lights in one combined budget', () => {
    const points = [8, 7, 6].map((x) => createPointLight({ position: { x, y: 0, z: 0 }, range: -1 }));
    const spots = [5, 4, 3].map((x) =>
      createSpotLight({
        direction: { x: -1, y: 0, z: 0 },
        innerConeDegrees: 45,
        outerConeDegrees: 60,
        position: { x, y: 0, z: 0 },
        range: -1,
      }),
    );
    const out = selection();
    selectSceneForwardLights(
      out,
      { ambient: null, directional: null, point: points, spot: spots },
      createBoundingSphere(0, 0, 0, 0),
    );
    expect(out.point).toHaveLength(1);
    expect(out.spot).toHaveLength(3);
    expect(out.indices).toEqual([5, 4, 3, 2]);
  });

  it('uses stable input order to break equal-contribution ties', () => {
    const points = Array.from({ length: 6 }, () => createPointLight({ position: { x: 2, y: 0, z: 0 }, range: -1 }));
    const out = selection();
    selectSceneForwardLights(
      out,
      { ambient: null, directional: null, point: points },
      createBoundingSphere(0, 0, 0, 0),
    );
    expect(out.point).toEqual(points.slice(0, 4));
    expect(out.indices).toEqual([0, 1, 2, 3]);
  });

  it('omits zero-contribution lights', () => {
    const out = selection();
    selectSceneForwardLights(
      out,
      {
        ambient: null,
        directional: null,
        point: [createPointLight({ position: { x: 10, y: 0, z: 0 }, range: 2 })],
      },
      createBoundingSphere(0, 0, 0, 0),
    );
    expect(out.point).toHaveLength(0);
    expect(out.indices).toHaveLength(0);
  });

  it('reads all inputs before writing an aliased output', () => {
    const points = [
      createPointLight({ position: { x: 4, y: 0, z: 0 }, range: -1 }),
      createPointLight({ position: { x: 1, y: 0, z: 0 }, range: -1 }),
    ];
    const far = points[0];
    const near = points[1];
    const lights: SceneLightsLike = { ambient: null, directional: null, point: points, spot: [] };
    const out = lights as SceneLightsLike & SceneForwardLightSelection;
    out.indices = [];
    selectSceneForwardLights(out, lights, createBoundingSphere(0, 0, 0, 0));
    expect(out.point).toEqual([near, far]);
    expect(out.indices).toEqual([1, 0]);
  });
});
