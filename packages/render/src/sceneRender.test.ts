import {
  createCamera3D,
  createPerspectiveProjection,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/camera/contract';
import { unpackColorToLinear } from '@flighthq/color/contract';
import { createAabb, createMatrix4 } from '@flighthq/geometry/contract';
import {
  createAmbientLight,
  createDirectionalLight,
  createHemisphereLight,
  createPointLight,
  createSpotLight,
} from '@flighthq/lighting/contract';
import {
  CANONICAL_MESH_GEOMETRY_LAYOUT,
  computeMeshGeometryBounds,
  createBoxMeshGeometry,
  createMeshGeometry,
} from '@flighthq/mesh/contract';
import {
  addNodeChild,
  getNodeWorldMatrix4,
  invalidateNodeLocalTransform,
  setNodeLocalMatrix4,
} from '@flighthq/node/contract';
import {
  createInstancedMesh,
  createMesh,
  createNode3D,
  Node3DKind,
  getNode3DWorldAlpha,
  setInstancedMeshInstanceCount,
  setInstancedMeshInstanceMatrix,
} from '@flighthq/scene3d/contract';
import type {
  Mesh,
  Matrix4,
  Skin,
  Camera3D,
  Material,
  MeshGeometry,
  Scene3DLightBlock,
  Scene3DLightsLike,
} from '@flighthq/types/contract';
import {
  SCENE_LIGHT_BLOCK_FLOATS,
  SCENE_LIGHT_HEMISPHERE_OFFSET,
  SCENE_LIGHT_POINT_OFFSET,
  SCENE_LIGHT_SPOT_OFFSET,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createRenderState } from './renderState';
import { packScene3DLightBlock, prepareScene3DRender, setSkinnedMeshBoundsGuard } from './sceneRender';

function boundedBox(): MeshGeometry {
  const geometry = createBoxMeshGeometry(2, 2, 2);
  const bounds = createAabb();
  computeMeshGeometryBounds(bounds, geometry);
  geometry.bounds = bounds;
  return geometry;
}

function cameraLookingAtX(x: number): Camera3D {
  const camera = createCamera3D({
    far: 200,
    near: 0.1,
    projection: createPerspectiveProjection({ aspect: 1, fovY: Math.PI / 3 }),
  });
  setCamera3DViewMatrix4FromLookAt(camera, { x: x, y: 0, z: 20 }, { x: x, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  return camera;
}

function frontCamera(): Camera3D {
  const camera = createCamera3D({
    far: 100,
    near: 0.1,
    projection: createPerspectiveProjection({ aspect: 1, fovY: Math.PI / 3 }),
  });
  setCamera3DViewMatrix4FromLookAt(camera, { x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  return camera;
}

function emptyLights(): Scene3DLightsLike {
  return { ambient: null, directional: null };
}

function translationMatrix(x: number): Matrix4 {
  const matrix = createMatrix4();
  matrix.m[12] = x;
  return matrix;
}

function newLightBlock(): Scene3DLightBlock {
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

describe('packScene3DLightBlock', () => {
  it('zeroes the block and clears counts when no lights are present', () => {
    const block = newLightBlock();
    block.data[0] = 5;
    packScene3DLightBlock(block, emptyLights());
    expect(block.directionalCount).toBe(0);
    expect(block.ambientCount).toBe(0);
    expect(block.data[0]).toBe(0);
  });

  it('packs the directional direction and linear, premultiplied radiance', () => {
    const block = newLightBlock();
    const directional = createDirectionalLight({ color: 0xffffffff, direction: { x: 0, y: -1, z: 0 }, intensity: 2 });
    packScene3DLightBlock(block, { ambient: null, directional });
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
    packScene3DLightBlock(block, { ambient, directional: null });
    expect(block.ambientCount).toBe(1);
    const expected = unpackColorToLinear([0, 0, 0, 0], 0xffffffff);
    expect(block.data[8]).toBeCloseTo(expected[0] * 0.5);
    expect(block.data[9]).toBeCloseTo(expected[1] * 0.5);
    expect(block.data[10]).toBeCloseTo(expected[2] * 0.5);
  });

  it('bumps version when the packed block changes', () => {
    const block = newLightBlock();
    packScene3DLightBlock(block, emptyLights());
    const v = block.version;
    packScene3DLightBlock(block, {
      ambient: createAmbientLight({ color: 0xffffffff, intensity: 0.5 }),
      directional: null,
    });
    expect(block.version).toBe(v + 1);
  });

  it('does not bump version when re-packed with identical lights', () => {
    const block = newLightBlock();
    const lights = { ambient: createAmbientLight({ color: 0xffffffff, intensity: 0.5 }), directional: null };
    packScene3DLightBlock(block, lights);
    const v = block.version;
    packScene3DLightBlock(block, lights);
    expect(block.version).toBe(v);
  });

  it('decodes sRgb color to linear (a mid-gray channel is darker in linear)', () => {
    const block = newLightBlock();
    const ambient = createAmbientLight({ color: 0x808080ff, intensity: 1 });
    packScene3DLightBlock(block, { ambient, directional: null });
    expect(block.data[8]).toBeLessThan(0x80 / 0xff);
    expect(block.data[8]).toBeGreaterThan(0);
  });

  it('packs point lights: position + range, and linear radiance + inverse-square range', () => {
    const block = newLightBlock();
    const point = createPointLight({ color: 0xffffffff, intensity: 3, position: { x: 1, y: 2, z: 3 }, range: 10 });
    packScene3DLightBlock(block, { ambient: null, directional: null, point: [point] });
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
    packScene3DLightBlock(block, { ambient: null, directional: null, point: [point] });
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
    packScene3DLightBlock(block, { ambient: null, directional: null, spot: [spot] });
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
    packScene3DLightBlock(block, { ambient: null, directional: null, hemisphere: [hemisphere] });
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
    packScene3DLightBlock(block, { ambient: null, directional: null, point: many });
    expect(block.pointCount).toBe(4);
  });

  it('reports zero counts for empty punctual arrays', () => {
    const block = newLightBlock();
    packScene3DLightBlock(block, { ambient: null, directional: null, hemisphere: [], point: [], spot: [] });
    expect(block.pointCount).toBe(0);
    expect(block.spotCount).toBe(0);
    expect(block.hemisphereCount).toBe(0);
  });

  it('does not bump version when re-packed with identical punctual lights', () => {
    const block = newLightBlock();
    const lights = { ambient: null, directional: null, point: [createPointLight({ range: 5 })] };
    packScene3DLightBlock(block, lights);
    const v = block.version;
    packScene3DLightBlock(block, lights);
    expect(block.version).toBe(v);
  });
});

describe('prepareScene3DRender', () => {
  it('returns the lit, view-projected frame with the visible mesh', () => {
    const state = createRenderState();
    const scene = createNode3D(Node3DKind);
    const mesh = createMesh(boundedBox(), [null]);
    addNodeChild(scene, mesh);

    const list = prepareScene3DRender(state, scene, frontCamera(), {
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
    const scene = createNode3D(Node3DKind);
    const list = prepareScene3DRender(state, scene, frontCamera(), emptyLights());
    // A perspective view-projection is not the identity matrix.
    expect(list.viewProjection.m[15]).not.toBe(1);
  });

  it('uses a draw-time viewport aspect without mutating the camera projection', () => {
    const state = createRenderState();
    const scene = createNode3D(Node3DKind);
    const camera = frontCamera();

    const tallXScale = prepareScene3DRender(state, scene, camera, emptyLights(), 0.5).viewProjection.m[0];
    const wideXScale = prepareScene3DRender(state, scene, camera, emptyLights(), 2).viewProjection.m[0];

    expect(tallXScale).toBeCloseTo(wideXScale * 4);
    expect(camera.projection.kind).toBe('perspective');
    if (camera.projection.kind === 'perspective') expect(camera.projection.aspect).toBe(1);
  });

  it('consumes camera jitter in the prepared view-projection', () => {
    const state = createRenderState();
    const scene = createNode3D(Node3DKind);
    const camera = frontCamera();
    const baseXOffset = prepareScene3DRender(state, scene, camera, emptyLights()).viewProjection.m[8];

    camera.jitter.x = 0.125;
    const jitteredXOffset = prepareScene3DRender(state, scene, camera, emptyLights()).viewProjection.m[8];

    expect(jitteredXOffset).toBeCloseTo(baseXOffset - 0.125);
  });

  it('culls a mesh placed far behind the camera', () => {
    const state = createRenderState();
    const scene = createNode3D(Node3DKind);
    const mesh = createMesh(boundedBox(), [null]);
    mesh.position.z = 1000;
    invalidateNodeLocalTransform(mesh);
    addNodeChild(scene, mesh);

    const list = prepareScene3DRender(state, scene, frontCamera(), emptyLights());
    expect(list.meshCount).toBe(0);
  });

  it('computes uncached bounds on demand and culls against them', () => {
    // A null bounds cache is uncomputed, not uncullable: the cull ensures the bounds (the box has
    // vertices) and then culls a far-off box normally, rather than conservatively keeping it.
    const state = createRenderState();
    const scene = createNode3D(Node3DKind);
    const mesh = createMesh(createBoxMeshGeometry(2, 2, 2), [null]);
    mesh.geometry.bounds = null;
    mesh.position.z = 1000;
    invalidateNodeLocalTransform(mesh);
    addNodeChild(scene, mesh);

    const list = prepareScene3DRender(state, scene, frontCamera(), emptyLights());
    expect(list.meshCount).toBe(0);
  });

  it('keeps a mesh whose geometry is empty and cannot be bounded', () => {
    // Truly unbounded geometry (no vertices) is the only case ensureMeshGeometryBounds returns null
    // for, and it is what "cannot cull, so conservatively keep" now means.
    const state = createRenderState();
    const scene = createNode3D(Node3DKind);
    const empty = createMeshGeometry({ layout: CANONICAL_MESH_GEOMETRY_LAYOUT, vertices: new Float32Array(0) });
    const mesh = createMesh(empty, [null]);
    mesh.position.z = 1000;
    invalidateNodeLocalTransform(mesh);
    addNodeChild(scene, mesh);

    const list = prepareScene3DRender(state, scene, frontCamera(), emptyLights());
    expect(list.meshCount).toBe(1);
  });

  it('skips disabled subtrees', () => {
    const state = createRenderState();
    const scene = createNode3D(Node3DKind);
    const group = createNode3D(Node3DKind, { enabled: false });
    const mesh = createMesh(boundedBox(), [null]);
    addNodeChild(group, mesh);
    addNodeChild(scene, group);

    const list = prepareScene3DRender(state, scene, frontCamera(), emptyLights());
    expect(list.meshCount).toBe(0);
  });

  it('skips a hidden subtree (visible=false propagates to descendants)', () => {
    const state = createRenderState();
    const scene = createNode3D(Node3DKind);
    const group = createNode3D(Node3DKind);
    group.visible = false;
    const mesh = createMesh(boundedBox(), [null]);
    addNodeChild(group, mesh);
    addNodeChild(scene, group);

    const list = prepareScene3DRender(state, scene, frontCamera(), emptyLights());
    expect(list.meshCount).toBe(0);
  });

  it('resolves world transforms through nested groups', () => {
    const state = createRenderState();
    const scene = createNode3D(Node3DKind);
    const group = createNode3D(Node3DKind);
    const mesh = createMesh(boundedBox(), [null]);
    addNodeChild(group, mesh);
    addNodeChild(scene, group);
    group.position.x = 1;
    invalidateNodeLocalTransform(group);

    const list = prepareScene3DRender(state, scene, frontCamera(), emptyLights());
    expect(list.meshCount).toBe(1);
    expect(list.visibleMeshes[0]).toBe(mesh);
  });

  it('folds parent x self alpha into each node resolved worldAlpha', () => {
    const state = createRenderState();
    const scene = createNode3D(Node3DKind);
    const group = createNode3D(Node3DKind);
    const mesh = createMesh(boundedBox(), [null]);
    addNodeChild(group, mesh);
    addNodeChild(scene, group);
    scene.alpha = 0.5;
    group.alpha = 0.5;
    mesh.alpha = 0.5;

    prepareScene3DRender(state, scene, frontCamera(), emptyLights());
    expect(getNode3DWorldAlpha(scene)).toBeCloseTo(0.5);
    expect(getNode3DWorldAlpha(group)).toBeCloseTo(0.25);
    expect(getNode3DWorldAlpha(mesh)).toBeCloseTo(0.125);
  });

  it('reuses the same list per render state across calls', () => {
    const state = createRenderState();
    const scene = createNode3D(Node3DKind);
    const first = prepareScene3DRender(state, scene, frontCamera(), emptyLights());
    const second = prepareScene3DRender(state, scene, frontCamera(), emptyLights());
    expect(second).toBe(first);
  });

  it('honors a positional material on a mesh', () => {
    const state = createRenderState();
    const scene = createNode3D(Node3DKind);
    const material = { kind: 'TestMaterial' } as unknown as Material;
    const mesh = createMesh(boundedBox(), [material]);
    addNodeChild(scene, mesh);
    const list = prepareScene3DRender(state, scene, frontCamera(), emptyLights());
    expect(list.visibleMeshes[0].materials[0]).toBe(material);
  });

  it('refreshes a mesh world transform under the default policy without an explicit invalidate', () => {
    const state = createRenderState(); // default 'refreshDerivedState'
    const scene = createNode3D(Node3DKind);
    const mesh = createMesh(boundedBox(), [null]);
    addNodeChild(scene, mesh);
    const camera = frontCamera();
    prepareScene3DRender(state, scene, camera, emptyLights());
    mesh.position.x = 3; // bare mutation, no invalidateNodeLocalTransform
    prepareScene3DRender(state, scene, camera, emptyLights());
    expect(getNodeWorldMatrix4(mesh).m[12]).toBeCloseTo(3);
  });

  it('preserves a directly-authored local matrix under the default refresh policy', () => {
    const state = createRenderState();
    const scene = createNode3D(Node3DKind);
    const mesh = createMesh(boundedBox(), [null]);
    addNodeChild(scene, mesh);
    const local = createMatrix4();
    local.m[12] = 3;
    setNodeLocalMatrix4(mesh, local);

    prepareScene3DRender(state, scene, frontCamera(), emptyLights());

    expect(getNodeWorldMatrix4(mesh).m[12]).toBeCloseTo(3);
  });

  it('leaves a mesh world transform stale under requiresInvalidation until invalidated', () => {
    const state = createRenderState({ sceneGraphSyncPolicy: 'requiresInvalidation' });
    const scene = createNode3D(Node3DKind);
    const mesh = createMesh(boundedBox(), [null]);
    addNodeChild(scene, mesh);
    const camera = frontCamera();
    prepareScene3DRender(state, scene, camera, emptyLights());
    mesh.position.x = 3;
    prepareScene3DRender(state, scene, camera, emptyLights());
    expect(getNodeWorldMatrix4(mesh).m[12]).toBeCloseTo(0); // stale: the caller never invalidated
    invalidateNodeLocalTransform(mesh);
    prepareScene3DRender(state, scene, camera, emptyLights());
    expect(getNodeWorldMatrix4(mesh).m[12]).toBeCloseTo(3);
  });

  // An instance draws at `worldMatrix * instanceMatrix`, so the per-instance matrices are part of the
  // batch's extent. Culling on the bare geometry bounds at the node origin describes one instance
  // sitting on the node and drops a batch that is entirely on screen.
  it('keeps an instanced mesh whose instances are placed away from the node origin', () => {
    const state = createRenderState();
    const scene = createNode3D(Node3DKind);
    const mesh = createInstancedMesh(boundedBox(), [null], 4);
    setInstancedMeshInstanceCount(mesh, 1);
    setInstancedMeshInstanceMatrix(mesh, 0, translationMatrix(60));
    addNodeChild(scene, mesh);

    const list = prepareScene3DRender(state, scene, cameraLookingAtX(60), emptyLights());

    expect(list.instancedMeshCount).toBe(1);
    expect(list.visibleInstancedMeshes[0]).toBe(mesh);
  });

  it('culls an instanced mesh whose instances are all outside the frustum', () => {
    const state = createRenderState();
    const scene = createNode3D(Node3DKind);
    const mesh = createInstancedMesh(boundedBox(), [null], 4);
    setInstancedMeshInstanceCount(mesh, 1);
    setInstancedMeshInstanceMatrix(mesh, 0, translationMatrix(0));
    addNodeChild(scene, mesh);

    const list = prepareScene3DRender(state, scene, cameraLookingAtX(60), emptyLights());

    expect(list.instancedMeshCount).toBe(0);
  });

  // The instance union is cached against the InstancedMesh version, so a batch that moves must not
  // keep the extent it had last frame.
  it('re-culls an instanced mesh after its instance matrices move', () => {
    const state = createRenderState();
    const scene = createNode3D(Node3DKind);
    const mesh = createInstancedMesh(boundedBox(), [null], 4);
    setInstancedMeshInstanceCount(mesh, 1);
    setInstancedMeshInstanceMatrix(mesh, 0, translationMatrix(0));
    addNodeChild(scene, mesh);
    const camera = cameraLookingAtX(60);

    expect(prepareScene3DRender(state, scene, camera, emptyLights()).instancedMeshCount).toBe(0);

    setInstancedMeshInstanceMatrix(mesh, 0, translationMatrix(60));

    expect(prepareScene3DRender(state, scene, camera, emptyLights()).instancedMeshCount).toBe(1);
  });

  // The union spans every live instance, so a batch straddling the frustum edge stays visible for the
  // instances that are on screen.
  it('keeps an instanced mesh when only some instances are in view', () => {
    const state = createRenderState();
    const scene = createNode3D(Node3DKind);
    const mesh = createInstancedMesh(boundedBox(), [null], 4);
    setInstancedMeshInstanceCount(mesh, 2);
    setInstancedMeshInstanceMatrix(mesh, 0, translationMatrix(0));
    setInstancedMeshInstanceMatrix(mesh, 1, translationMatrix(60));
    addNodeChild(scene, mesh);

    const list = prepareScene3DRender(state, scene, cameraLookingAtX(60), emptyLights());

    expect(list.instancedMeshCount).toBe(1);
  });
});

describe('setSkinnedMeshBoundsGuard', () => {
  afterEach(() => setSkinnedMeshBoundsGuard(null));

  // The seam keeps the message and the @flighthq/log dependency in the separately-importable guard
  // module; the cull path only calls whatever is installed.
  it('reports the skinned mesh that reached culling without posed bounds', () => {
    const seen: Mesh[] = [];
    setSkinnedMeshBoundsGuard((mesh) => seen.push(mesh as Mesh));
    const state = createRenderState();
    const scene = createNode3D(Node3DKind);
    const mesh = createMesh(boundedBox(), [null]);
    mesh.skin = {} as Skin;
    addNodeChild(scene, mesh);

    prepareScene3DRender(state, scene, frontCamera(), {
      ambient: createAmbientLight(),
      directional: createDirectionalLight(),
    });

    expect(seen).toEqual([mesh]);
  });

  it('stops reporting once cleared with null', () => {
    let calls = 0;
    setSkinnedMeshBoundsGuard(() => (calls += 1));
    const state = createRenderState();
    const scene = createNode3D(Node3DKind);
    const mesh = createMesh(boundedBox(), [null]);
    mesh.skin = {} as Skin;
    addNodeChild(scene, mesh);
    const lights = { ambient: createAmbientLight(), directional: createDirectionalLight() };

    prepareScene3DRender(state, scene, frontCamera(), lights);
    setSkinnedMeshBoundsGuard(null);
    prepareScene3DRender(state, scene, frontCamera(), lights);

    expect(calls).toBe(1);
  });
});
