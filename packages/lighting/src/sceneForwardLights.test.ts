import { createBoundingSphere } from '@flighthq/geometry/contract';
import type { Scene3DForwardLightSelection, Scene3DLightsLike } from '@flighthq/types/contract';

import { createPointLight } from './pointLight';
import { selectScene3DForwardLights } from './sceneForwardLights';
import { createSpotLight } from './spotLight';

function selection(): Scene3DForwardLightSelection {
  return { indices: [], point: [], spot: [] };
}

function spotLights(xs: readonly number[]) {
  return xs.map((x) =>
    createSpotLight({
      direction: { x: -1, y: 0, z: 0 },
      innerConeDegrees: 45,
      outerConeDegrees: 60,
      position: { x, y: 0, z: 0 },
      range: -1,
    }),
  );
}

describe('selectScene3DForwardLights', () => {
  it('keeps all three points and three spots when both families are within budget', () => {
    const points = [8, 7, 6].map((x) => createPointLight({ position: { x, y: 0, z: 0 }, range: -1 }));
    const spots = spotLights([5, 4, 3]);
    const out = selection();
    selectScene3DForwardLights(
      out,
      { ambient: null, directional: null, point: points, spot: spots },
      createBoundingSphere(0, 0, 0, 0),
    );
    expect(out.point).toHaveLength(3);
    expect(out.spot).toHaveLength(3);
    expect(new Set(out.point)).toEqual(new Set(points));
    expect(new Set(out.spot)).toEqual(new Set(spots));
  });

  it('ranks the family cutoff by linear-light radiance instead of packed sRGB channels', () => {
    const gray = Array.from({ length: 4 }, () =>
      createPointLight({
        color: 0x808080ff,
        intensity: 1,
        position: { x: 2, y: 0, z: 0 },
        range: -1,
      }),
    );
    const white = createPointLight({
      color: 0xffffffff,
      intensity: 0.3,
      position: { x: 2, y: 0, z: 0 },
      range: -1,
    });
    const out = selection();
    selectScene3DForwardLights(
      out,
      { ambient: null, directional: null, point: [...gray, white] },
      createBoundingSphere(0, 0, 0, 0),
    );
    expect(out.point).toContain(white);
    expect(out.point).toHaveLength(4);
  });

  it('selects the strongest four points and strongest four spots independently', () => {
    const points = [8, 7, 6, 5, 4, 3].map((x) => createPointLight({ position: { x, y: 0, z: 0 }, range: -1 }));
    const spots = spotLights([8, 7, 6, 5, 4, 3]);
    const out = selection();
    selectScene3DForwardLights(
      out,
      { ambient: null, directional: null, point: points, spot: spots },
      createBoundingSphere(0, 0, 0, 0),
    );
    expect(out.point).toEqual(points.slice(2).reverse());
    expect(out.spot).toEqual(spots.slice(2).reverse());
    expect(out.indices).toEqual([5, 4, 3, 2, ~5, ~4, ~3, ~2]);
  });

  it('uses stable input order to break equal-contribution ties', () => {
    const points = Array.from({ length: 6 }, () => createPointLight({ position: { x: 2, y: 0, z: 0 }, range: -1 }));
    const out = selection();
    selectScene3DForwardLights(
      out,
      { ambient: null, directional: null, point: points },
      createBoundingSphere(0, 0, 0, 0),
    );
    expect(out.point).toEqual(points.slice(0, 4));
    expect(out.indices).toEqual([0, 1, 2, 3]);
  });

  it('omits zero-contribution lights', () => {
    const out = selection();
    selectScene3DForwardLights(
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

  it('omits disabled lights even when they would otherwise rank first', () => {
    const disabled = createPointLight({ enabled: false, intensity: 100, position: { x: 1, y: 0, z: 0 }, range: -1 });
    const enabled = createPointLight({ position: { x: 2, y: 0, z: 0 }, range: -1 });
    const out = selection();
    selectScene3DForwardLights(
      out,
      { ambient: null, directional: null, point: [disabled, enabled] },
      createBoundingSphere(0, 0, 0, 0),
    );
    expect(out.point).toEqual([enabled]);
    expect(out.indices).toEqual([1]);
  });

  it('uses decay when ranking the forward-light budget', () => {
    const inverseSquare = createPointLight({ decay: 2, position: { x: 4, y: 0, z: 0 }, range: -1 });
    const linear = createPointLight({ decay: 1, position: { x: 4, y: 0, z: 0 }, range: -1 });
    const fillers = [1, 2, 3].map((x) => createPointLight({ position: { x, y: 0, z: 0 }, range: -1 }));
    const out = selection();
    selectScene3DForwardLights(
      out,
      { ambient: null, directional: null, point: [...fillers, inverseSquare, linear] },
      createBoundingSphere(0, 0, 0, 0),
    );
    expect(out.point).toContain(linear);
    expect(out.point).not.toContain(inverseSquare);
  });

  it('reads all inputs before writing an aliased output', () => {
    const points = [
      createPointLight({ position: { x: 4, y: 0, z: 0 }, range: -1 }),
      createPointLight({ position: { x: 1, y: 0, z: 0 }, range: -1 }),
    ];
    const far = points[0];
    const near = points[1];
    const lights: Scene3DLightsLike = { ambient: null, directional: null, point: points, spot: [] };
    const out = lights as Scene3DLightsLike & Scene3DForwardLightSelection;
    out.indices = [];
    selectScene3DForwardLights(out, lights, createBoundingSphere(0, 0, 0, 0));
    expect(out.point).toEqual([near, far]);
    expect(out.indices).toEqual([1, 0]);
  });
});

describe('selectScene3DForwardLights layer and priority policy', () => {
  it('skips a light whose layerMask does not meet the receiver, freeing its budget slot', () => {
    // The filter has to run BEFORE ranking: a light the receiver cannot see must not occupy a slot a
    // visible light would have taken. Both lights here would otherwise be selected.
    const visible = createPointLight({ intensity: 1, layerMask: 0b01, position: { x: 0, y: 0, z: 0 }, range: -1 });
    const hidden = createPointLight({ intensity: 10, layerMask: 0b10, position: { x: 0, y: 0, z: 0 }, range: -1 });
    const out = selection();
    selectScene3DForwardLights(
      out,
      { ambient: null, directional: null, point: [hidden, visible], spot: [] },
      createBoundingSphere(0, 0, 0, 0),
      0b01,
    );
    expect(out.point).toHaveLength(1);
    expect(out.point[0]).toBe(visible);
  });

  it('lights every layer by default, so an unconfigured light is not silently dark', () => {
    const light = createPointLight({ intensity: 1, position: { x: 0, y: 0, z: 0 }, range: -1 });
    const out = selection();
    selectScene3DForwardLights(
      out,
      { ambient: null, directional: null, point: [light], spot: [] },
      createBoundingSphere(0, 0, 0, 0),
    );
    expect(out.point).toHaveLength(1);
  });

  it('ranks priority above contribution, so a key light outranks a brighter incidental one', () => {
    const key = createPointLight({ intensity: 1, priority: 1, position: { x: 0, y: 0, z: 0 }, range: -1 });
    const brighter = createPointLight({ intensity: 50, position: { x: 0, y: 0, z: 0 }, range: -1 });
    const out = selection();
    selectScene3DForwardLights(
      out,
      { ambient: null, directional: null, point: [brighter, key], spot: [] },
      createBoundingSphere(0, 0, 0, 0),
    );
    expect(out.point[0]).toBe(key);
  });

  it('falls back to contribution within one priority, preserving the previous order exactly', () => {
    // Every light at the default 0 must reproduce pure-contribution order, which is what makes the
    // field additive rather than a behaviour change for existing scenes.
    const dim = createPointLight({ intensity: 1, position: { x: 0, y: 0, z: 0 }, range: -1 });
    const bright = createPointLight({ intensity: 50, position: { x: 0, y: 0, z: 0 }, range: -1 });
    const out = selection();
    selectScene3DForwardLights(
      out,
      { ambient: null, directional: null, point: [dim, bright], spot: [] },
      createBoundingSphere(0, 0, 0, 0),
    );
    expect(out.point[0]).toBe(bright);
  });
});
