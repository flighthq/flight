import { createCamera3D, setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera';
import { createVector3 } from '@flighthq/geometry';
import { createAmbientLight, createDirectionalLight } from '@flighthq/lighting';
import { createStandardPbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild, invalidateNodeLocalTransform } from '@flighthq/node';
import { createParticleEmitter3D, reserveParticleEmitter3D } from '@flighthq/particleemitter';
import { createMesh, createSceneNode, SceneNodeKind } from '@flighthq/scene';
import type { Camera3D, ParticleEmitter3D, SceneLightsLike } from '@flighthq/types';

import { drawWgpuScene } from './drawWgpuScene';
import { registerStandardPbrWgpuMaterial } from './registerStandardPbrWgpuMaterial';
import { getWgpuSceneRuntime } from './wgpuSceneRuntime';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';

function makeCamera(): Camera3D {
  const camera = createCamera3D({
    far: 100,
    near: 0.1,
    projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' },
  });
  setCamera3DViewMatrix4FromLookAt(camera, { x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  return camera;
}

const LIGHTS: SceneLightsLike = {
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 0.2 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: createVector3(0, -1, -1), intensity: 1 }),
};

describe('drawWgpuScene', () => {
  it('draws each visible mesh subset with its registered material renderer', () => {
    const { fake, state } = makeWgpuSceneState();
    registerStandardPbrWgpuMaterial(state);

    const scene = createSceneNode(SceneNodeKind);
    const mesh = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    addNodeChild(scene, mesh);

    drawWgpuScene(state, scene, makeCamera(), LIGHTS);

    expect(fake.calls.some((c) => c.name === 'setPipeline')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(true);
  });

  it('skips a subset whose material has no registered renderer (no fallback)', () => {
    const { fake, state } = makeWgpuSceneState();
    // No registerStandardPbrWgpuMaterial: nothing resolves.
    const scene = createSceneNode(SceneNodeKind);
    const mesh = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    addNodeChild(scene, mesh);

    drawWgpuScene(state, scene, makeCamera(), LIGHTS);
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(false);
  });

  it('binds once for a run of subsets sharing a material', () => {
    const { fake, state } = makeWgpuSceneState();
    registerStandardPbrWgpuMaterial(state);

    const scene = createSceneNode(SceneNodeKind);
    const material = createStandardPbrMaterial();
    const meshA = createMesh(createBoxMeshGeometry(), [material]);
    const meshB = createMesh(createBoxMeshGeometry(), [material]);
    addNodeChild(scene, meshA);
    addNodeChild(scene, meshB);

    drawWgpuScene(state, scene, makeCamera(), LIGHTS);

    // Same material across both meshes: pipeline bound once, drawn twice.
    expect(fake.calls.filter((c) => c.name === 'setPipeline').length).toBe(1);
    expect(fake.calls.filter((c) => c.name === 'drawIndexed').length).toBe(2);
  });

  it('does not draw a disabled mesh', () => {
    const { fake, state } = makeWgpuSceneState();
    registerStandardPbrWgpuMaterial(state);

    const scene = createSceneNode(SceneNodeKind);
    const mesh = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    mesh.enabled = false;
    addNodeChild(scene, mesh);

    drawWgpuScene(state, scene, makeCamera(), LIGHTS);
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(false);
  });

  it('partitions opaque and blended subsets into distinct pipeline runs', () => {
    const { state } = makeWgpuSceneState();
    registerStandardPbrWgpuMaterial(state);
    const scene = createSceneNode(SceneNodeKind);
    const blendedMaterial = createStandardPbrMaterial();
    blendedMaterial.alphaMode = 'blend';
    const blended = createMesh(createBoxMeshGeometry(), [blendedMaterial]);
    const opaque = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    addNodeChild(scene, blended);
    addNodeChild(scene, opaque);

    drawWgpuScene(state, scene, makeCamera(), LIGHTS);

    const runtime = getWgpuSceneRuntime(state);
    expect(runtime.opaqueDrawList.map((entry) => entry.mesh)).toEqual([opaque]);
    expect(runtime.blendedDrawList.map((entry) => entry.mesh)).toEqual([blended]);
    expect(Array.from(runtime.pipelineCache.keys()).some((key) => key.endsWith('|opaque'))).toBe(true);
    expect(Array.from(runtime.pipelineCache.keys()).some((key) => key.endsWith('|blend'))).toBe(true);
  });

  it('routes resolved node alpha through the blended pass and draw proxy', () => {
    const { state } = makeWgpuSceneState();
    registerStandardPbrWgpuMaterial(state);
    const scene = createSceneNode(SceneNodeKind);
    const mesh = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    mesh.alpha = 0.5;
    addNodeChild(scene, mesh);

    drawWgpuScene(state, scene, makeCamera(), LIGHTS);

    const runtime = getWgpuSceneRuntime(state);
    expect(runtime.opaqueDrawList).toHaveLength(0);
    expect(runtime.blendedDrawList[0]!.alpha).toBeCloseTo(0.5);
    expect(Array.from(runtime.pipelineCache.keys()).some((key) => key.endsWith('|blend'))).toBe(true);
  });

  it('sorts blended subsets back-to-front by clip W', () => {
    const { state } = makeWgpuSceneState();
    registerStandardPbrWgpuMaterial(state);
    const scene = createSceneNode(SceneNodeKind);
    const material = createStandardPbrMaterial();
    material.alphaMode = 'blend';
    const far = createMesh(createBoxMeshGeometry(), [material]);
    const near = createMesh(createBoxMeshGeometry(), [material]);
    far.position.z = -3;
    near.position.z = -1;
    invalidateNodeLocalTransform(far);
    invalidateNodeLocalTransform(near);
    addNodeChild(scene, near);
    addNodeChild(scene, far);

    drawWgpuScene(state, scene, makeCamera(), LIGHTS);

    expect(getWgpuSceneRuntime(state).blendedDrawList.map((entry) => entry.mesh)).toEqual([far, near]);
  });

  it('reuses opaque and blended draw records across frames', () => {
    const { state } = makeWgpuSceneState();
    registerStandardPbrWgpuMaterial(state);
    const scene = createSceneNode(SceneNodeKind);
    const opaque = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    const material = createStandardPbrMaterial();
    material.alphaMode = 'blend';
    const blended = createMesh(createBoxMeshGeometry(), [material]);
    addNodeChild(scene, opaque);
    addNodeChild(scene, blended);
    const camera = makeCamera();

    drawWgpuScene(state, scene, camera, LIGHTS);
    const runtime = getWgpuSceneRuntime(state);
    const opaqueEntry = runtime.opaqueDrawList[0];
    const blendedEntry = runtime.blendedDrawList[0];
    drawWgpuScene(state, scene, camera, LIGHTS);

    expect(runtime.opaqueDrawList[0]).toBe(opaqueEntry);
    expect(runtime.blendedDrawList[0]).toBe(blendedEntry);
    expect(runtime.opaquePool).toHaveLength(0);
    expect(runtime.blendedPool).toHaveLength(0);
  });

  it('draws a scene ParticleEmitter3D as a final pass without a manual emitter call', () => {
    const { fake, state } = makeWgpuSceneState();
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, makeParticleEmitter2D(3));
    // No mesh and no manual drawWgpuSceneParticleEmitter3Ds — drawWgpuScene must render the emitter itself
    // (a 6-index instanced quad draw), mirroring drawGlScene's automatic emitter pass.
    drawWgpuScene(state, scene, makeCamera(), LIGHTS);
    const draw = fake.calls.find((c) => c.name === 'drawIndexed');
    expect(draw).toBeDefined();
    expect(draw!.args[0]).toBe(6);
    expect(draw!.args[1]).toBe(3);
  });
});

function makeParticleEmitter2D(count: number): ParticleEmitter3D {
  const emitter = createParticleEmitter3D();
  reserveParticleEmitter3D(emitter, count);
  const data = emitter.data;
  data.particleCount = count;
  for (let i = 0; i < count; i++) {
    const tt = i * 4;
    data.transforms[tt] = i;
    data.transforms[tt + 1] = i;
    data.transforms[tt + 2] = 0;
    data.transforms[tt + 3] = 1;
    data.positionsZ[i] = 0;
    data.alphas[i] = 1;
    const ct = i * 3;
    data.colors[ct] = 1;
    data.colors[ct + 1] = 1;
    data.colors[ct + 2] = 1;
    data.ids[i] = 0;
  }
  return emitter;
}
