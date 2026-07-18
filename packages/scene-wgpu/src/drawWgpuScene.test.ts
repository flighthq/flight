import { createCamera, setCameraViewMatrix4FromLookAt } from '@flighthq/camera';
import { createVector3 } from '@flighthq/geometry';
import { createAmbientLight, createDirectionalLight } from '@flighthq/lighting';
import { createStandardPbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { createParticleEmitter3D, reserveParticleEmitter3D } from '@flighthq/particleemitter';
import { createMesh, createScene } from '@flighthq/scene';
import type { Camera, ParticleEmitter3D, SceneLights } from '@flighthq/types';

import { drawWgpuScene } from './drawWgpuScene';
import { registerStandardPbrWgpuMaterial } from './registerStandardPbrWgpuMaterial';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';

function makeCamera(): Camera {
  const camera = createCamera({
    far: 100,
    near: 0.1,
    projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' },
  });
  setCameraViewMatrix4FromLookAt(camera, { x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  return camera;
}

const LIGHTS: SceneLights = {
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 0.2 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: createVector3(0, -1, -1), intensity: 1 }),
};

describe('drawWgpuScene', () => {
  it('draws each visible mesh subset with its registered material renderer', () => {
    const { fake, state } = makeWgpuSceneState();
    registerStandardPbrWgpuMaterial(state);

    const scene = createScene();
    const mesh = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    addNodeChild(scene, mesh);

    drawWgpuScene(state, scene, makeCamera(), LIGHTS);

    expect(fake.calls.some((c) => c.name === 'setPipeline')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(true);
  });

  it('skips a subset whose material has no registered renderer (no fallback)', () => {
    const { fake, state } = makeWgpuSceneState();
    // No registerStandardPbrWgpuMaterial: nothing resolves.
    const scene = createScene();
    const mesh = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    addNodeChild(scene, mesh);

    drawWgpuScene(state, scene, makeCamera(), LIGHTS);
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(false);
  });

  it('binds once for a run of subsets sharing a material', () => {
    const { fake, state } = makeWgpuSceneState();
    registerStandardPbrWgpuMaterial(state);

    const scene = createScene();
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

    const scene = createScene();
    const mesh = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    mesh.enabled = false;
    addNodeChild(scene, mesh);

    drawWgpuScene(state, scene, makeCamera(), LIGHTS);
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(false);
  });

  it('draws a scene ParticleEmitter3D as a final pass without a manual emitter call', () => {
    const { fake, state } = makeWgpuSceneState();
    const scene = createScene();
    addNodeChild(scene, makeParticleEmitter(3));
    // No mesh and no manual drawWgpuSceneParticleEmitters — drawWgpuScene must render the emitter itself
    // (a 6-index instanced quad draw), mirroring drawGlScene's automatic emitter pass.
    drawWgpuScene(state, scene, makeCamera(), LIGHTS);
    const draw = fake.calls.find((c) => c.name === 'drawIndexed');
    expect(draw).toBeDefined();
    expect(draw!.args[0]).toBe(6);
    expect(draw!.args[1]).toBe(3);
  });
});

function makeParticleEmitter(count: number): ParticleEmitter3D {
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
