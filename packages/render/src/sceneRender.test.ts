import { createCamera, createPerspectiveProjection, setCameraViewMatrix4FromLookAt } from '@flighthq/camera';
import { unpackColorToLinear } from '@flighthq/color';
import { createAabb } from '@flighthq/geometry';
import {
  createAmbientLight,
  createDirectionalLight,
  createHemisphereLight,
  createPointLight,
  createSpotLight,
} from '@flighthq/lighting';
import { computeMeshGeometryBounds, createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild, invalidateNodeLocalTransform } from '@flighthq/node';
import { createMesh, createScene, getSceneNodeWorldAlpha } from '@flighthq/scene';
import type { Camera, Material, MeshGeometry, SceneLightBlock, SceneLights } from '@flighthq/types';
import {
  SCENE_LIGHT_BLOCK_FLOATS,
  SCENE_LIGHT_HEMISPHERE_OFFSET,
  SCENE_LIGHT_POINT_OFFSET,
  SCENE_LIGHT_SPOT_OFFSET,
} from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createRenderState } from './renderState';
import { packSceneLightBlock, prepareSceneRender } from './sceneRender';

function boundedBox(): MeshGeometry {
  const geometry = createBoxMeshGeometry(2, 2, 2);
  const bounds = createAabb();
  computeMeshGeometryBounds(bounds, geometry);
  geometry.bounds = bounds;
  return geometry;
}

function frontCamera(): Camera {
  const camera = createCamera({
    far: 100,
    near: 0.1,
    projection: createPerspectiveProjection({ aspect: 1, fovY: Math.PI / 3 }),
  });
  setCameraViewMatrix4FromLookAt(camera, { x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  return camera;
}

function emptyLights(): SceneLights {
  return { ambient: null, directional: null };
}

function newLightBlock(): SceneLightBlock {
  return {
    ambientCount: 0,
    data: new Float32Array(SCENE_LIGHT_BLOCK_FLOATS),
    directionalCount: 0,
    hemisphereCount: 0,
    pointCount: 0,
    spotCount: 0,
    version: 0,
  };
}

describe('packSceneLightBlock', () => {
  it('zeroes the block and clears counts when no lights are present', () => {
    const block = newLightBlock();
    block.data[0] = 5;
    packSceneLightBlock(block, emptyLights());
    expect(block.directionalCount).toBe(0);
    expect(block.ambientCount).toBe(0);
    expect(block.data[0]).toBe(0);
  });

  it('packs the directional direction and linear, premultiplied radiance', () => {
    const block = newLightBlock();
    const directional = createDirectionalLight({ color: 0xffffffff, direction: { x: 0, y: -1, z: 0 }, intensity: 2 });
    packSceneLightBlock(block, { ambient: null, directional });
    expect(block.directionalCount).toBe(1);
    expect(block.data[0]).toBeCloseTo(0);
    expect(block.data[1]).toBeCloseTo(-1);
    expect(block.data[2]).toBeCloseTo(0);
    const expected = unpackColorToLinear([0, 0, 0, 0], 0xffffffff);
    expect(block.data[4]).toBeCloseTo(expected[0] * 2);
    expect(block.data[5]).toBeCloseTo(expected[1] * 2);
    expect(block.data[6]).toBeCloseTo(expected[2] * 2);
  });

  it('packs the ambient radiance into the ambient slot', () => {
    const block = newLightBlock();
    const ambient = createAmbientLight({ color: 0xffffffff, intensity: 0.5 });
    packSceneLightBlock(block, { ambient, directional: null });
    expect(block.ambientCount).toBe(1);
    const expected = unpackColorToLinear([0, 0, 0, 0], 0xffffffff);
    expect(block.data[8]).toBeCloseTo(expected[0] * 0.5);
    expect(block.data[9]).toBeCloseTo(expected[1] * 0.5);
    expect(block.data[10]).toBeCloseTo(expected[2] * 0.5);
  });

  it('bumps version when the packed block changes', () => {
    const block = newLightBlock();
    packSceneLightBlock(block, emptyLights());
    const v = block.version;
    packSceneLightBlock(block, {
      ambient: createAmbientLight({ color: 0xffffffff, intensity: 0.5 }),
      directional: null,
    });
    expect(block.version).toBe(v + 1);
  });

  it('does not bump version when re-packed with identical lights', () => {
    const block = newLightBlock();
    const lights = { ambient: createAmbientLight({ color: 0xffffffff, intensity: 0.5 }), directional: null };
    packSceneLightBlock(block, lights);
    const v = block.version;
    packSceneLightBlock(block, lights);
    expect(block.version).toBe(v);
  });

  it('decodes sRgb color to linear (a mid-gray channel is darker in linear)', () => {
    const block = newLightBlock();
    const ambient = createAmbientLight({ color: 0x808080ff, intensity: 1 });
    packSceneLightBlock(block, { ambient, directional: null });
    expect(block.data[8]).toBeLessThan(0x80 / 0xff);
    expect(block.data[8]).toBeGreaterThan(0);
  });

  it('packs point lights: position + range, and linear radiance + inverse-square range', () => {
    const block = newLightBlock();
    const point = createPointLight({ color: 0xffffffff, intensity: 3, position: { x: 1, y: 2, z: 3 }, range: 10 });
    packSceneLightBlock(block, { ambient: null, directional: null, point: [point] });
    expect(block.pointCount).toBe(1);
    const o = SCENE_LIGHT_POINT_OFFSET;
    expect(block.data[o + 0]).toBeCloseTo(1);
    expect(block.data[o + 1]).toBeCloseTo(2);
    expect(block.data[o + 2]).toBeCloseTo(3);
    expect(block.data[o + 3]).toBeCloseTo(10);
    const expected = unpackColorToLinear([0, 0, 0, 0], 0xffffffff);
    expect(block.data[o + 4]).toBeCloseTo(expected[0] * 3);
    expect(block.data[o + 7]).toBeCloseTo(1 / (10 * 10));
  });

  it('packs an infinite-range point light with invSqrRange 0 (no cutoff)', () => {
    const block = newLightBlock();
    const point = createPointLight({ range: -1 });
    packSceneLightBlock(block, { ambient: null, directional: null, point: [point] });
    expect(block.data[SCENE_LIGHT_POINT_OFFSET + 3]).toBeCloseTo(-1);
    expect(block.data[SCENE_LIGHT_POINT_OFFSET + 7]).toBe(0);
  });

  it('packs spot lights: point record plus direction and the precomputed cone cosines', () => {
    const block = newLightBlock();
    const spot = createSpotLight({
      direction: { x: 0, y: -1, z: 0 },
      innerConeDegrees: 10,
      outerConeDegrees: 30,
      position: { x: 4, y: 5, z: 6 },
    });
    packSceneLightBlock(block, { ambient: null, directional: null, spot: [spot] });
    expect(block.spotCount).toBe(1);
    const o = SCENE_LIGHT_SPOT_OFFSET;
    expect(block.data[o + 0]).toBeCloseTo(4);
    expect(block.data[o + 8]).toBeCloseTo(0);
    expect(block.data[o + 9]).toBeCloseTo(-1);
    expect(block.data[o + 10]).toBeCloseTo(0);
    expect(block.data[o + 12]).toBeCloseTo(spot.innerConeCos);
    expect(block.data[o + 13]).toBeCloseTo(spot.outerConeCos);
    // Inner cone (smaller angle) has the larger cosine.
    expect(block.data[o + 12]).toBeGreaterThan(block.data[o + 13]);
  });

  it('packs hemisphere lights: sky, ground, and packed world-up', () => {
    const block = newLightBlock();
    const hemisphere = createHemisphereLight({ groundColor: 0x000000ff, intensity: 2, skyColor: 0xffffffff });
    packSceneLightBlock(block, { ambient: null, directional: null, hemisphere: [hemisphere] });
    expect(block.hemisphereCount).toBe(1);
    const o = SCENE_LIGHT_HEMISPHERE_OFFSET;
    const sky = unpackColorToLinear([0, 0, 0, 0], 0xffffffff);
    expect(block.data[o + 0]).toBeCloseTo(sky[0] * 2);
    expect(block.data[o + 4]).toBeCloseTo(0);
    // Packed world-up (0, 1, 0).
    expect(block.data[o + 8]).toBeCloseTo(0);
    expect(block.data[o + 9]).toBeCloseTo(1);
    expect(block.data[o + 10]).toBeCloseTo(0);
  });

  it('caps each punctual array at MAX_FORWARD_LIGHTS', () => {
    const block = newLightBlock();
    const many = Array.from({ length: 9 }, () => createPointLight());
    packSceneLightBlock(block, { ambient: null, directional: null, point: many });
    expect(block.pointCount).toBe(4);
  });

  it('reports zero counts for empty punctual arrays', () => {
    const block = newLightBlock();
    packSceneLightBlock(block, { ambient: null, directional: null, hemisphere: [], point: [], spot: [] });
    expect(block.pointCount).toBe(0);
    expect(block.spotCount).toBe(0);
    expect(block.hemisphereCount).toBe(0);
  });

  it('does not bump version when re-packed with identical punctual lights', () => {
    const block = newLightBlock();
    const lights = { ambient: null, directional: null, point: [createPointLight({ range: 5 })] };
    packSceneLightBlock(block, lights);
    const v = block.version;
    packSceneLightBlock(block, lights);
    expect(block.version).toBe(v);
  });
});

describe('prepareSceneRender', () => {
  it('returns the lit, view-projected frame with the visible mesh', () => {
    const state = createRenderState();
    const scene = createScene();
    const mesh = createMesh(boundedBox(), [null]);
    addNodeChild(scene, mesh);

    const list = prepareSceneRender(state, scene, frontCamera(), {
      ambient: createAmbientLight(),
      directional: createDirectionalLight(),
    });

    expect(list.meshCount).toBe(1);
    expect(list.visibleMeshes[0]).toBe(mesh);
    expect(list.lights.directionalCount).toBe(1);
    expect(list.lights.ambientCount).toBe(1);
  });

  it('computes a non-identity view-projection', () => {
    const state = createRenderState();
    const scene = createScene();
    const list = prepareSceneRender(state, scene, frontCamera(), emptyLights());
    // A perspective view-projection is not the identity matrix.
    expect(list.viewProjection.m[15]).not.toBe(1);
  });

  it('culls a mesh placed far behind the camera', () => {
    const state = createRenderState();
    const scene = createScene();
    const mesh = createMesh(boundedBox(), [null]);
    mesh.translation.z = 1000;
    invalidateNodeLocalTransform(mesh);
    addNodeChild(scene, mesh);

    const list = prepareSceneRender(state, scene, frontCamera(), emptyLights());
    expect(list.meshCount).toBe(0);
  });

  it('keeps a mesh whose geometry has no cached bounds', () => {
    const state = createRenderState();
    const scene = createScene();
    const mesh = createMesh(createBoxMeshGeometry(), [null]);
    mesh.geometry.bounds = null;
    mesh.translation.z = 1000;
    invalidateNodeLocalTransform(mesh);
    addNodeChild(scene, mesh);

    const list = prepareSceneRender(state, scene, frontCamera(), emptyLights());
    expect(list.meshCount).toBe(1);
  });

  it('skips disabled subtrees', () => {
    const state = createRenderState();
    const scene = createScene();
    const group = createScene({ enabled: false });
    const mesh = createMesh(boundedBox(), [null]);
    addNodeChild(group, mesh);
    addNodeChild(scene, group);

    const list = prepareSceneRender(state, scene, frontCamera(), emptyLights());
    expect(list.meshCount).toBe(0);
  });

  it('skips a hidden subtree (visible=false propagates to descendants)', () => {
    const state = createRenderState();
    const scene = createScene();
    const group = createScene();
    group.visible = false;
    const mesh = createMesh(boundedBox(), [null]);
    addNodeChild(group, mesh);
    addNodeChild(scene, group);

    const list = prepareSceneRender(state, scene, frontCamera(), emptyLights());
    expect(list.meshCount).toBe(0);
  });

  it('resolves world transforms through nested groups', () => {
    const state = createRenderState();
    const scene = createScene();
    const group = createScene();
    const mesh = createMesh(boundedBox(), [null]);
    addNodeChild(group, mesh);
    addNodeChild(scene, group);
    group.translation.x = 1;
    invalidateNodeLocalTransform(group);

    const list = prepareSceneRender(state, scene, frontCamera(), emptyLights());
    expect(list.meshCount).toBe(1);
    expect(list.visibleMeshes[0]).toBe(mesh);
  });

  it('folds parent x self alpha into each node resolved worldAlpha', () => {
    const state = createRenderState();
    const scene = createScene();
    const group = createScene();
    const mesh = createMesh(boundedBox(), [null]);
    addNodeChild(group, mesh);
    addNodeChild(scene, group);
    scene.alpha = 0.5;
    group.alpha = 0.5;
    mesh.alpha = 0.5;

    prepareSceneRender(state, scene, frontCamera(), emptyLights());
    expect(getSceneNodeWorldAlpha(scene)).toBeCloseTo(0.5);
    expect(getSceneNodeWorldAlpha(group)).toBeCloseTo(0.25);
    expect(getSceneNodeWorldAlpha(mesh)).toBeCloseTo(0.125);
  });

  it('reuses the same list per render state across calls', () => {
    const state = createRenderState();
    const scene = createScene();
    const first = prepareSceneRender(state, scene, frontCamera(), emptyLights());
    const second = prepareSceneRender(state, scene, frontCamera(), emptyLights());
    expect(second).toBe(first);
  });

  it('honors a positional material on a mesh', () => {
    const state = createRenderState();
    const scene = createScene();
    const material = { kind: 'TestMaterial' } as unknown as Material;
    const mesh = createMesh(boundedBox(), [material]);
    addNodeChild(scene, mesh);
    const list = prepareSceneRender(state, scene, frontCamera(), emptyLights());
    expect(list.visibleMeshes[0].materials[0]).toBe(material);
  });
});
