import { createCamera3D } from '@flighthq/camera';
import { createMatrix4, setVector3 } from '@flighthq/geometry';
import { addNodeChild, invalidateNodeLocalTransform } from '@flighthq/node';
import { createParticleEmitter3D, reserveParticleEmitter3D } from '@flighthq/particleemitter';
import { createSceneNode, SceneNodeKind } from '@flighthq/scene';
import type { Camera3D, ParticleEmitter3D, SceneLightsLike } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { destroyWgpuParticleEmitter3DResources, drawWgpuSceneParticleEmitter3Ds } from './wgpuParticleEmitter3D';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';

function makeCamera(): Camera3D {
  const cam = createCamera3D({
    far: 100,
    near: 0.1,
    projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' },
  });
  cam.view = createMatrix4();
  return cam;
}

function makeLights(): SceneLightsLike {
  return { ambient: null, directional: null };
}

function makeEmitterWithParticles(count: number): ParticleEmitter3D {
  const emitter = createParticleEmitter3D();
  reserveParticleEmitter3D(emitter, count);
  const data = emitter.data;
  data.particleCount = count;
  for (let i = 0; i < count; i++) {
    const tt = i * 4;
    data.transforms[tt] = i;
    data.transforms[tt + 1] = i * 2;
    data.transforms[tt + 2] = 0;
    data.transforms[tt + 3] = 1;
    data.positionsZ[i] = i * 3;
    data.alphas[i] = 1;
    const ct = i * 3;
    data.colors[ct] = 1;
    data.colors[ct + 1] = 1;
    data.colors[ct + 2] = 1;
    data.ids[i] = 0;
  }
  return emitter;
}

function makeAtlasEmitter(regionWidth: number, regionHeight: number): ParticleEmitter3D {
  const emitter = makeEmitterWithParticles(1);
  const img = document.createElement('img');
  emitter.data.atlas = {
    image: { source: img, width: 128, height: 128 },
    regions: [{ id: 0, x: 0, y: 0, width: regionWidth, height: regionHeight }],
  } as unknown as NonNullable<ParticleEmitter3D['data']['atlas']>;
  return emitter;
}

function findInstanceWrite(calls: { name: string; args: unknown[] }[]): Float32Array | undefined {
  // The instance upload is the writeBuffer whose data is a Float32Array longer than the 8-float corner
  // quad; the frame upload passes an ArrayBuffer and the corner buffer a length-8 array.
  const call = calls.find(
    (c) => c.name === 'writeBuffer' && c.args[2] instanceof Float32Array && (c.args[2] as Float32Array).length > 8,
  );
  return call?.args[2] as Float32Array | undefined;
}

function pipelineDescriptors(calls: { name: string; args: unknown[] }[]): Record<string, unknown>[] {
  return calls.filter((c) => c.name === 'createRenderPipeline').map((c) => c.args[0] as Record<string, unknown>);
}

function hasTextureConstant(descriptor: Record<string, unknown>): number {
  const fragment = descriptor['fragment'] as { constants: Record<string, number> };
  return fragment.constants['HAS_TEXTURE'];
}

describe('destroyWgpuParticleEmitter3DResources', () => {
  it('is a no-op when no resources were created', () => {
    const { state } = makeWgpuSceneState();
    expect(() => destroyWgpuParticleEmitter3DResources(state)).not.toThrow();
  });

  it('drops resources after a draw', () => {
    const { state } = makeWgpuSceneState();
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, makeEmitterWithParticles(1));
    drawWgpuSceneParticleEmitter3Ds(state, scene, makeCamera(), makeLights());
    expect(() => destroyWgpuParticleEmitter3DResources(state)).not.toThrow();
  });
});

describe('drawWgpuSceneParticleEmitter3Ds', () => {
  it('is a no-op when the scene has no particle emitter nodes', () => {
    const { state, fake } = makeWgpuSceneState();
    const scene = createSceneNode(SceneNodeKind);
    drawWgpuSceneParticleEmitter3Ds(state, scene, makeCamera(), makeLights());
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(false);
  });

  it('skips emitters with zero particles', () => {
    const { state, fake } = makeWgpuSceneState();
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, createParticleEmitter3D());
    drawWgpuSceneParticleEmitter3Ds(state, scene, makeCamera(), makeLights());
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(false);
  });

  it('issues one instanced indexed draw of 6 indices per emitter', () => {
    const { state, fake } = makeWgpuSceneState();
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, makeEmitterWithParticles(5));
    drawWgpuSceneParticleEmitter3Ds(state, scene, makeCamera(), makeLights());
    const draw = fake.calls.find((c) => c.name === 'drawIndexed');
    expect(draw).toBeDefined();
    expect(draw!.args[0]).toBe(6);
    expect(draw!.args[1]).toBe(5);
  });

  it('uploads the per-instance data to a vertex buffer', () => {
    const { state, fake } = makeWgpuSceneState();
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, makeEmitterWithParticles(3));
    drawWgpuSceneParticleEmitter3Ds(state, scene, makeCamera(), makeLights());
    expect(findInstanceWrite(fake.calls)).toBeDefined();
  });

  it('normalizes the particle quad to an aspect-ratio unit square, not the region pixel size', () => {
    const { state, fake } = makeWgpuSceneState();
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, makeAtlasEmitter(64, 32));
    drawWgpuSceneParticleEmitter3Ds(state, scene, makeCamera(), makeLights());
    const instanceData = findInstanceWrite(fake.calls)!;
    // Instance floats [13]/[14] carry the normalized quad size for the first particle.
    expect(instanceData[13]).toBeCloseTo(1);
    expect(instanceData[14]).toBeCloseTo(0.5);
  });

  it('compiles the textured pipeline variant for an atlas emitter', () => {
    const { state, fake } = makeWgpuSceneState();
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, makeAtlasEmitter(64, 64));
    drawWgpuSceneParticleEmitter3Ds(state, scene, makeCamera(), makeLights());
    expect(pipelineDescriptors(fake.calls).some((d) => hasTextureConstant(d) === 1)).toBe(true);
  });

  it('compiles the untextured pipeline variant for an atlas-less emitter', () => {
    const { state, fake } = makeWgpuSceneState();
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, makeEmitterWithParticles(1));
    drawWgpuSceneParticleEmitter3Ds(state, scene, makeCamera(), makeLights());
    const descriptors = pipelineDescriptors(fake.calls);
    expect(descriptors.length).toBe(1);
    expect(hasTextureConstant(descriptors[0])).toBe(0);
  });

  it('reuses the cached pipeline on a second draw', () => {
    const { state, fake } = makeWgpuSceneState();
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, makeEmitterWithParticles(1));
    drawWgpuSceneParticleEmitter3Ds(state, scene, makeCamera(), makeLights());
    drawWgpuSceneParticleEmitter3Ds(state, scene, makeCamera(), makeLights());
    // One variant compiled once across both draws — the shader module and pipeline are cached per state.
    expect(pipelineDescriptors(fake.calls).length).toBe(1);
  });

  it('skips the node world transform for world-space particles', () => {
    const { state, fake } = makeWgpuSceneState();
    const scene = createSceneNode(SceneNodeKind);
    const emitter = makeEmitterWithParticles(1);
    emitter.data.transforms[0] = 1;
    emitter.data.transforms[1] = 2;
    emitter.data.positionsZ[0] = 3;
    setVector3(emitter.position, 10, 20, 30);
    invalidateNodeLocalTransform(emitter);
    emitter.data.worldSpace = true;
    addNodeChild(scene, emitter);
    drawWgpuSceneParticleEmitter3Ds(state, scene, makeCamera(), makeLights());
    const instanceData = findInstanceWrite(fake.calls)!;
    // Already baked into world space, so the (10,20,30) node translation is not re-applied.
    expect(instanceData[0]).toBeCloseTo(1);
    expect(instanceData[1]).toBeCloseTo(2);
    expect(instanceData[2]).toBeCloseTo(3);
  });

  it('applies the node world transform for local-space particles', () => {
    const { state, fake } = makeWgpuSceneState();
    const scene = createSceneNode(SceneNodeKind);
    const emitter = makeEmitterWithParticles(1);
    emitter.data.transforms[0] = 1;
    emitter.data.transforms[1] = 2;
    emitter.data.positionsZ[0] = 3;
    setVector3(emitter.position, 10, 20, 30);
    invalidateNodeLocalTransform(emitter);
    addNodeChild(scene, emitter);
    drawWgpuSceneParticleEmitter3Ds(state, scene, makeCamera(), makeLights());
    const instanceData = findInstanceWrite(fake.calls)!;
    expect(instanceData[0]).toBeCloseTo(11);
    expect(instanceData[1]).toBeCloseTo(22);
    expect(instanceData[2]).toBeCloseTo(33);
  });
});
