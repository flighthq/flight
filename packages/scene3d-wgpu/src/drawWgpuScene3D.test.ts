import { createCamera3D, setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera/contract';
import { createVector3 } from '@flighthq/geometry/contract';
import { createAmbientLight, createDirectionalLight } from '@flighthq/lighting/contract';
import { createStandardPbrMaterial } from '@flighthq/materials/contract';
import {
  CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
  createBoxMeshGeometry,
  createMeshGeometry,
} from '@flighthq/mesh/contract';
import { addNodeChild, invalidateNodeLocalTransform } from '@flighthq/node/contract';
import { createParticleEmitter3D, reserveParticleEmitter3D } from '@flighthq/particleemitter/contract';
import {
  createWgpuOffscreenRenderState,
  createWgpuPipeline,
  getWgpuRenderStateRuntime,
} from '@flighthq/render-wgpu/contract';
import { createMesh, createNode3D, Node3DKind } from '@flighthq/scene3d/contract';
import type { Camera3D, ParticleEmitter3D, Scene3DLightsLike, Skeleton3D } from '@flighthq/types/contract';
import { BlendMode } from '@flighthq/types/contract';

import { drawWgpuScene3D, isWgpuMeshGpuSkinned } from './drawWgpuScene3D';
import { registerWgpuStandardPbrMaterial } from './registerWgpuStandardPbrMaterial';
import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';
import { registerWgpuGpuSkinning } from './wgpuSkinPalette';

function makeCamera(): Camera3D {
  const camera = createCamera3D({
    far: 100,
    near: 0.1,
    projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' },
  });
  setCamera3DViewMatrix4FromLookAt(camera, { x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  return camera;
}

const LIGHTS: Scene3DLightsLike = {
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 0.2 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: createVector3(0, -1, -1), intensity: 1 }),
};

describe('drawWgpuScene3D', () => {
  it('uploads one shared geometry once across a primary and derived state on the same device', () => {
    const { fake, state } = makeWgpuScene3DState();
    registerWgpuStandardPbrMaterial(state);
    const derived = createWgpuOffscreenRenderState(
      state.deviceState,
      createWgpuPipeline(getWgpuRenderStateRuntime(state).registries),
      { format: state.format },
    );
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const derivedRuntime = getWgpuRenderStateRuntime(derived);
    derivedRuntime.commandEncoder = stateRuntime.commandEncoder;
    derivedRuntime.renderPass = stateRuntime.renderPass;

    const geometry = createBoxMeshGeometry();
    const scene = createNode3D(Node3DKind);
    addNodeChild(scene, createMesh(geometry, [createStandardPbrMaterial()]));
    const meshBuffersBefore = countMeshBuffers(fake.calls);

    drawWgpuScene3D(state, scene, makeCamera(), LIGHTS);
    drawWgpuScene3D(derived, scene, makeCamera(), LIGHTS);

    // 2 geometry buffers (vertex + index, shared across states) + 2 per-state instance buffers.
    expect(countMeshBuffers(fake.calls)).toBe(meshBuffersBefore + 4);
  });

  it('draws each visible mesh subset with its registered material renderer', () => {
    const { fake, state } = makeWgpuScene3DState();
    registerWgpuStandardPbrMaterial(state);

    const scene = createNode3D(Node3DKind);
    const mesh = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    addNodeChild(scene, mesh);

    drawWgpuScene3D(state, scene, makeCamera(), LIGHTS);

    expect(fake.calls.some((c) => c.name === 'setPipeline')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(true);
  });

  it('skips a subset whose material has no registered renderer (no fallback)', () => {
    const { fake, state } = makeWgpuScene3DState();
    // No registerWgpuStandardPbrMaterial: nothing resolves.
    const scene = createNode3D(Node3DKind);
    const mesh = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    addNodeChild(scene, mesh);

    drawWgpuScene3D(state, scene, makeCamera(), LIGHTS);
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(false);
  });

  it('binds once for a run of subsets sharing a material', () => {
    const { fake, state } = makeWgpuScene3DState();
    registerWgpuStandardPbrMaterial(state);

    const scene = createNode3D(Node3DKind);
    const material = createStandardPbrMaterial();
    const meshA = createMesh(createBoxMeshGeometry(), [material]);
    const meshB = createMesh(createBoxMeshGeometry(), [material]);
    addNodeChild(scene, meshA);
    addNodeChild(scene, meshB);

    drawWgpuScene3D(state, scene, makeCamera(), LIGHTS);

    // Same material across both meshes: pipeline bound once, drawn twice.
    expect(fake.calls.filter((c) => c.name === 'setPipeline').length).toBe(1);
    expect(fake.calls.filter((c) => c.name === 'drawIndexed').length).toBe(2);
  });

  it('does not draw a disabled mesh', () => {
    const { fake, state } = makeWgpuScene3DState();
    registerWgpuStandardPbrMaterial(state);

    const scene = createNode3D(Node3DKind);
    const mesh = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    mesh.enabled = false;
    addNodeChild(scene, mesh);

    drawWgpuScene3D(state, scene, makeCamera(), LIGHTS);
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(false);
  });

  it('partitions opaque and blended subsets into distinct pipeline runs', () => {
    const { state } = makeWgpuScene3DState();
    registerWgpuStandardPbrMaterial(state);
    const scene = createNode3D(Node3DKind);
    const blendedMaterial = createStandardPbrMaterial();
    blendedMaterial.alphaMode = 'blend';
    const blended = createMesh(createBoxMeshGeometry(), [blendedMaterial]);
    const opaque = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    addNodeChild(scene, blended);
    addNodeChild(scene, opaque);

    drawWgpuScene3D(state, scene, makeCamera(), LIGHTS);

    const runtime = getWgpuScene3DRuntime(state);
    expect(runtime.opaqueDrawList.map((entry) => entry.mesh)).toEqual([opaque]);
    expect(runtime.blendedDrawList.map((entry) => entry.mesh)).toEqual([blended]);
    expect(Array.from(runtime.pipelineCache.keys()).some((key) => key.endsWith('|opaque|rigid'))).toBe(true);
    expect(Array.from(runtime.pipelineCache.keys()).some((key) => key.endsWith('|blend:Normal|rigid'))).toBe(true);
  });

  it('selects a pipeline variant keyed by the surface material blendMode', () => {
    const { state } = makeWgpuScene3DState();
    registerWgpuStandardPbrMaterial(state);
    const scene = createNode3D(Node3DKind);
    const material = createStandardPbrMaterial({ alphaMode: 'blend', blendMode: BlendMode.Add });
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [material]));

    drawWgpuScene3D(state, scene, makeCamera(), LIGHTS);

    expect(
      Array.from(getWgpuScene3DRuntime(state).pipelineCache.keys()).some((key) => key.endsWith('|blend:Add|rigid')),
    ).toBe(true);
  });

  // Pipeline identity is the blend mode alone. It used to carry an alpha-convention segment too, which
  // is gone with the fork: one premultiplied blend state per mode, so the same mode is the same pipeline.
  it('keys a blended pipeline variant by blend mode alone', () => {
    const { state } = makeWgpuScene3DState();
    registerWgpuStandardPbrMaterial(state);
    const scene = createNode3D(Node3DKind);
    const material = createStandardPbrMaterial({ alphaMode: 'blend' });
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [material]));

    drawWgpuScene3D(state, scene, makeCamera(), LIGHTS);

    const keys = Array.from(getWgpuScene3DRuntime(state).pipelineCache.keys());
    expect(keys.some((key) => key.endsWith('|blend:Normal|rigid'))).toBe(true);
    expect(keys.some((key) => key.includes('straight') || key.includes('premultiplied'))).toBe(false);
  });

  it('routes resolved node alpha through the blended pass and draw proxy', () => {
    const { state } = makeWgpuScene3DState();
    registerWgpuStandardPbrMaterial(state);
    const scene = createNode3D(Node3DKind);
    const mesh = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    mesh.alpha = 0.5;
    addNodeChild(scene, mesh);

    drawWgpuScene3D(state, scene, makeCamera(), LIGHTS);

    const runtime = getWgpuScene3DRuntime(state);
    expect(runtime.opaqueDrawList).toHaveLength(0);
    expect(runtime.blendedDrawList[0]!.alpha).toBeCloseTo(0.5);
    expect(Array.from(runtime.pipelineCache.keys()).some((key) => key.endsWith('|blend:Normal|rigid'))).toBe(true);
  });

  it('sorts blended subsets back-to-front by projected depth', () => {
    const { state } = makeWgpuScene3DState();
    registerWgpuStandardPbrMaterial(state);
    const scene = createNode3D(Node3DKind);
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

    drawWgpuScene3D(state, scene, makeCamera(), LIGHTS);

    expect(getWgpuScene3DRuntime(state).blendedDrawList.map((entry) => entry.mesh)).toEqual([far, near]);
  });

  it('sorts blended subsets back-to-front with an orthographic camera', () => {
    const { state } = makeWgpuScene3DState();
    registerWgpuStandardPbrMaterial(state);
    const scene = createNode3D(Node3DKind);
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
    const camera = createCamera3D({
      far: 100,
      near: 0.1,
      projection: { halfHeight: 1, halfWidth: 1, kind: 'orthographic' },
    });
    setCamera3DViewMatrix4FromLookAt(camera, { x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    drawWgpuScene3D(state, scene, camera, LIGHTS);
    expect(getWgpuScene3DRuntime(state).blendedDrawList.map((entry) => entry.mesh)).toEqual([far, near]);
  });

  it('reuses opaque and blended draw records across frames', () => {
    const { state } = makeWgpuScene3DState();
    registerWgpuStandardPbrMaterial(state);
    const scene = createNode3D(Node3DKind);
    const opaque = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    const material = createStandardPbrMaterial();
    material.alphaMode = 'blend';
    const blended = createMesh(createBoxMeshGeometry(), [material]);
    addNodeChild(scene, opaque);
    addNodeChild(scene, blended);
    const camera = makeCamera();

    drawWgpuScene3D(state, scene, camera, LIGHTS);
    const runtime = getWgpuScene3DRuntime(state);
    const opaqueEntry = runtime.opaqueDrawList[0];
    const blendedEntry = runtime.blendedDrawList[0];
    drawWgpuScene3D(state, scene, camera, LIGHTS);

    expect(runtime.opaqueDrawList[0]).toBe(opaqueEntry);
    expect(runtime.blendedDrawList[0]).toBe(blendedEntry);
    expect(runtime.opaquePool).toHaveLength(0);
    expect(runtime.blendedPool).toHaveLength(0);
  });

  it('draws a scene ParticleEmitter3D as a final pass without a manual emitter call', () => {
    const { fake, state } = makeWgpuScene3DState();
    const scene = createNode3D(Node3DKind);
    addNodeChild(scene, makeParticleEmitter2D(3));
    // No mesh and no manual drawWgpuScene3DParticleEmitter3Ds — drawWgpuScene3D must render the emitter itself
    // (a 6-index instanced quad draw), mirroring drawGlScene3D's automatic emitter pass.
    drawWgpuScene3D(state, scene, makeCamera(), LIGHTS);
    const draw = fake.calls.find((c) => c.name === 'drawIndexed');
    expect(draw).toBeDefined();
    expect(draw!.args[0]).toBe(6);
    expect(draw!.args[1]).toBe(3);
  });
});

describe('isWgpuMeshGpuSkinned', () => {
  it('selects GPU skinning only for a skin plus joints0 and weights0 geometry', () => {
    const { state } = makeWgpuScene3DState();
    registerWgpuGpuSkinning(state);
    const rigid = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    expect(isWgpuMeshGpuSkinned(state, rigid)).toBe(false);

    const skinned = createMesh(
      createMeshGeometry({
        indices: new Uint16Array([0, 0, 0]),
        layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
        vertices: new Float32Array(20),
      }),
      [createStandardPbrMaterial()],
    );
    skinned.skin = { skeleton: { jointMatrices: new Float32Array(16) } as Skeleton3D };
    expect(isWgpuMeshGpuSkinned(state, skinned)).toBe(true);
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

function countMeshBuffers(calls: readonly { name: string; args: readonly unknown[] }[]): number {
  return calls.filter((call) => {
    if (call.name !== 'createBuffer') return false;
    const usage = (call.args[0] as GPUBufferDescriptor).usage;
    return (usage & (GPUBufferUsage.VERTEX | GPUBufferUsage.INDEX)) !== 0;
  }).length;
}
