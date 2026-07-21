import { createCamera3D } from '@flighthq/camera';
import { createMatrix4, setVector3 } from '@flighthq/geometry';
import { addNodeChild, invalidateNodeLocalTransform } from '@flighthq/node';
import { createParticleEmitter3D, reserveParticleEmitter3D } from '@flighthq/particleemitter';
import { createSceneNode, SceneNodeKind } from '@flighthq/scene';
import type { ParticleEmitter3D, SceneLights } from '@flighthq/types';

import { destroyGlParticleEmitter3DShader, drawGlSceneParticleEmitter2Ds } from './glParticleEmitter3D';
import { makeGlSceneState } from './glSceneTestHelper';

function makeCamera() {
  const cam = createCamera3D({
    far: 100,
    near: 0.1,
    projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' },
  });
  cam.view = createMatrix4();
  return cam;
}

function makeLights(): SceneLights {
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

// A single-particle emitter carrying a texture atlas whose sole region is regionWidth×regionHeight
// pixels within a 128×128 image. Exercises the atlas draw path — texture upload/bind and quad-size
// normalization — that the plain makeEmitterWithParticles (atlas === null) never reaches.
function makeAtlasEmitter(regionWidth: number, regionHeight: number): ParticleEmitter3D {
  const emitter = makeEmitterWithParticles(1);
  const img = document.createElement('img');
  emitter.data.atlas = {
    image: { source: img, width: 128, height: 128 },
    regions: [{ id: 0, x: 0, y: 0, width: regionWidth, height: regionHeight }],
  } as unknown as NonNullable<ParticleEmitter3D['data']['atlas']>;
  return emitter;
}

describe('destroyGlParticleEmitter3DShader', () => {
  it('is a no-op when no shader was created', () => {
    const { state } = makeGlSceneState();
    expect(() => destroyGlParticleEmitter3DShader(state)).not.toThrow();
  });

  it('deletes GPU resources after a draw', () => {
    const { state, gl } = makeGlSceneState();
    const scene = createSceneNode(SceneNodeKind);
    const emitter = makeEmitterWithParticles(1);
    addNodeChild(scene, emitter);
    drawGlSceneParticleEmitter2Ds(state, scene, makeCamera(), makeLights());
    destroyGlParticleEmitter3DShader(state);
    expect(gl.calls.some((c) => c.name === 'deleteProgram')).toBe(true);
    expect(gl.calls.filter((c) => c.name === 'deleteBuffer').length).toBeGreaterThanOrEqual(3);
  });
});

describe('drawGlSceneParticleEmitter2Ds', () => {
  it('is a no-op when scene has no particle emitter 3D nodes', () => {
    const { state, gl } = makeGlSceneState();
    const scene = createSceneNode(SceneNodeKind);
    drawGlSceneParticleEmitter2Ds(state, scene, makeCamera(), makeLights());
    expect(gl.calls.some((c) => c.name === 'drawElementsInstanced')).toBe(false);
  });

  it('skips emitters with zero particles', () => {
    const { state, gl } = makeGlSceneState();
    const scene = createSceneNode(SceneNodeKind);
    const emitter = createParticleEmitter3D();
    addNodeChild(scene, emitter);
    drawGlSceneParticleEmitter2Ds(state, scene, makeCamera(), makeLights());
    expect(gl.calls.some((c) => c.name === 'drawElementsInstanced')).toBe(false);
  });

  it('issues an instanced draw for particles', () => {
    const { state, gl } = makeGlSceneState();
    const scene = createSceneNode(SceneNodeKind);
    const emitter = makeEmitterWithParticles(5);
    addNodeChild(scene, emitter);
    drawGlSceneParticleEmitter2Ds(state, scene, makeCamera(), makeLights());
    const draw = gl.calls.find((c) => c.name === 'drawElementsInstanced');
    expect(draw).toBeDefined();
    expect(draw!.args[4]).toBe(5);
  });

  it('applies the emitter node world transform for local-space particles', () => {
    const { state, gl } = makeGlSceneState();
    const scene = createSceneNode(SceneNodeKind);
    const emitter = makeEmitterWithParticles(1);
    emitter.data.transforms[0] = 1;
    emitter.data.transforms[1] = 2;
    emitter.data.positionsZ[0] = 3;
    setVector3(emitter.position, 10, 20, 30);
    invalidateNodeLocalTransform(emitter);
    addNodeChild(scene, emitter);
    drawGlSceneParticleEmitter2Ds(state, scene, makeCamera(), makeLights());
    const instanceData = gl.calls.find((c) => c.name === 'bufferSubData')!.args[2] as Float32Array;
    // Local particles ride the emitter node: local (1,2,3) + node translation (10,20,30).
    expect(instanceData[0]).toBeCloseTo(11);
    expect(instanceData[1]).toBeCloseTo(22);
    expect(instanceData[2]).toBeCloseTo(33);
  });

  it('skips the node world transform for world-space particles already baked into world coordinates', () => {
    const { state, gl } = makeGlSceneState();
    const scene = createSceneNode(SceneNodeKind);
    const emitter = makeEmitterWithParticles(1);
    emitter.data.transforms[0] = 1;
    emitter.data.transforms[1] = 2;
    emitter.data.positionsZ[0] = 3;
    setVector3(emitter.position, 10, 20, 30);
    invalidateNodeLocalTransform(emitter);
    emitter.data.worldSpace = true;
    addNodeChild(scene, emitter);
    drawGlSceneParticleEmitter2Ds(state, scene, makeCamera(), makeLights());
    const instanceData = gl.calls.find((c) => c.name === 'bufferSubData')!.args[2] as Float32Array;
    // World-space particles already hold world coordinates, so the node translation must NOT be
    // re-applied: the instance position stays at the baked (1,2,3).
    expect(instanceData[0]).toBeCloseTo(1);
    expect(instanceData[1]).toBeCloseTo(2);
    expect(instanceData[2]).toBeCloseTo(3);
  });

  it('compiles the shader program on first call', () => {
    const { state, gl } = makeGlSceneState();
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, makeEmitterWithParticles(1));
    drawGlSceneParticleEmitter2Ds(state, scene, makeCamera(), makeLights());
    expect(gl.calls.some((c) => c.name === 'createProgram')).toBe(true);
  });

  it('reuses the shader program on subsequent calls', () => {
    const { state, gl } = makeGlSceneState();
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, makeEmitterWithParticles(1));
    drawGlSceneParticleEmitter2Ds(state, scene, makeCamera(), makeLights());
    const programCount = gl.calls.filter((c) => c.name === 'createProgram').length;
    drawGlSceneParticleEmitter2Ds(state, scene, makeCamera(), makeLights());
    expect(gl.calls.filter((c) => c.name === 'createProgram').length).toBe(programCount);
  });

  it('enables depth test and alpha blending', () => {
    const { state, gl } = makeGlSceneState();
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, makeEmitterWithParticles(1));
    drawGlSceneParticleEmitter2Ds(state, scene, makeCamera(), makeLights());
    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === gl.DEPTH_TEST)).toBe(true);
    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === gl.BLEND)).toBe(true);
    expect(gl.calls.some((c) => c.name === 'depthMask' && c.args[0] === false)).toBe(true);
  });

  it('applies the emitter blend mode: additive for add, premultiplied over-blend for normal', () => {
    const { state, gl } = makeGlSceneState();
    const scene = createSceneNode(SceneNodeKind);
    const additive = makeEmitterWithParticles(1);
    additive.blendMode = 'add';
    const normal = makeEmitterWithParticles(1);
    addNodeChild(scene, additive);
    addNodeChild(scene, normal);
    drawGlSceneParticleEmitter2Ds(state, scene, makeCamera(), makeLights());
    const blendFuncs = gl.calls.filter((c) => c.name === 'blendFunc');
    // add: straight ONE/ONE additive sum.
    expect(blendFuncs.some((c) => c.args[0] === gl.ONE && c.args[1] === gl.ONE)).toBe(true);
    // normal: premultiplied over-blend (ONE, ONE_MINUS_SRC_ALPHA), NOT SRC_ALPHA — the fragment
    // shader emits premultiplied color, so SRC_ALPHA would double-apply alpha and darken.
    expect(blendFuncs.some((c) => c.args[0] === gl.ONE && c.args[1] === gl.ONE_MINUS_SRC_ALPHA)).toBe(true);
    expect(blendFuncs.some((c) => c.args[0] === gl.SRC_ALPHA)).toBe(false);
  });

  it('uploads and binds the atlas image (never a null texture) for textured particles', () => {
    const { state, gl } = makeGlSceneState();
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, makeAtlasEmitter(64, 32));
    drawGlSceneParticleEmitter2Ds(state, scene, makeCamera(), makeLights());
    // The atlas image is uploaded to a GL texture on first use.
    expect(gl.calls.some((c) => c.name === 'texImage2D')).toBe(true);
    // Every texture bind targets a real texture object. Binding null here — as the bug did — leaves
    // an incomplete sampler that reads (0,0,0,1), turning each particle into a solid black quad.
    const textureBinds = gl.calls.filter((c) => c.name === 'bindTexture');
    expect(textureBinds.length).toBeGreaterThan(0);
    expect(textureBinds.every((c) => c.args[1] !== null)).toBe(true);
    // u_hasTexture is signaled on so the fragment shader samples the atlas.
    expect(
      gl.calls.some(
        (c) => c.name === 'uniform1i' && (c.args[0] as { name: string }).name === 'u_hasTexture' && c.args[1] === 1,
      ),
    ).toBe(true);
  });

  it('normalizes the particle quad to an aspect-ratio unit square, not the region pixel size', () => {
    const { state, gl } = makeGlSceneState();
    const scene = createSceneNode(SceneNodeKind);
    // A 64×32 region: the larger axis normalizes to 1, the shorter to its aspect ratio (0.5). The
    // raw pixel dims would make a 64-world-unit quad — screen-covering, with crippling overdraw.
    addNodeChild(scene, makeAtlasEmitter(64, 32));
    drawGlSceneParticleEmitter2Ds(state, scene, makeCamera(), makeLights());
    const upload = gl.calls.find((c) => c.name === 'bufferSubData');
    expect(upload).toBeDefined();
    const instanceData = upload!.args[2] as Float32Array;
    // a_size occupies instance floats [13] (width) and [14] (height) of the first particle.
    expect(instanceData[13]).toBeCloseTo(1);
    expect(instanceData[14]).toBeCloseTo(0.5);
  });

  it('does not upload a texture and signals u_hasTexture off for atlas-less emitters', () => {
    const { state, gl } = makeGlSceneState();
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, makeEmitterWithParticles(1));
    drawGlSceneParticleEmitter2Ds(state, scene, makeCamera(), makeLights());
    expect(gl.calls.some((c) => c.name === 'texImage2D')).toBe(false);
    expect(
      gl.calls.some(
        (c) => c.name === 'uniform1i' && (c.args[0] as { name: string }).name === 'u_hasTexture' && c.args[1] === 0,
      ),
    ).toBe(true);
  });

  it('restores depth write and disables blend after draw', () => {
    const { state, gl } = makeGlSceneState();
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, makeEmitterWithParticles(1));
    drawGlSceneParticleEmitter2Ds(state, scene, makeCamera(), makeLights());
    const depthMaskCalls = gl.calls.filter((c) => c.name === 'depthMask');
    expect(depthMaskCalls[depthMaskCalls.length - 1].args[0]).toBe(true);
    const disableCalls = gl.calls.filter((c) => c.name === 'disable');
    expect(disableCalls.some((c) => c.args[0] === gl.BLEND)).toBe(true);
  });

  it('uploads view-projection and camera vectors as uniforms', () => {
    const { state, gl } = makeGlSceneState();
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, makeEmitterWithParticles(1));
    drawGlSceneParticleEmitter2Ds(state, scene, makeCamera(), makeLights());
    expect(gl.calls.some((c) => c.name === 'uniformMatrix4fv')).toBe(true);
    const uniform3fCalls = gl.calls.filter((c) => c.name === 'uniform3f');
    expect(uniform3fCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('draws multiple emitters in one call', () => {
    const { state, gl } = makeGlSceneState();
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, makeEmitterWithParticles(3));
    addNodeChild(scene, makeEmitterWithParticles(7));
    drawGlSceneParticleEmitter2Ds(state, scene, makeCamera(), makeLights());
    const draws = gl.calls.filter((c) => c.name === 'drawElementsInstanced');
    expect(draws.length).toBe(2);
    expect(draws[0].args[4]).toBe(3);
    expect(draws[1].args[4]).toBe(7);
  });

  it('skips disabled emitters', () => {
    const { state, gl } = makeGlSceneState();
    const scene = createSceneNode(SceneNodeKind);
    const emitter = makeEmitterWithParticles(5);
    emitter.enabled = false;
    addNodeChild(scene, emitter);
    drawGlSceneParticleEmitter2Ds(state, scene, makeCamera(), makeLights());
    expect(gl.calls.some((c) => c.name === 'drawElementsInstanced')).toBe(false);
  });
});
