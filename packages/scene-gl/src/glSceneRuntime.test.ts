import type { GlRenderStateRuntime, GlRenderTarget, Matrix4 } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import type { GlMeshProgram } from './glMeshProgram';
import type { GlSceneIbl } from './glSceneRuntime';
import { destroyGlSceneRuntime, ensureGlSkinPalette, getGlSceneRuntime } from './glSceneRuntime';
import { makeGlSceneState } from './glSceneTestHelper';

describe('destroyGlSceneRuntime', () => {
  it('is a safe no-op when the state never allocated a scene runtime', () => {
    const { state, gl } = makeGlSceneState();
    destroyGlSceneRuntime(state);
    expect(gl.calls.some((c) => c.name.startsWith('delete'))).toBe(false);
  });

  it('frees the cached programs, the IBL set, the environment cube, and the shadow target, then clears the slots', () => {
    const { state, gl } = makeGlSceneState();
    const scene = getGlSceneRuntime(state);

    scene.programCache.set('a', { program: {} as WebGLProgram } as GlMeshProgram);
    scene.programCache.set('b', { program: {} as WebGLProgram } as GlMeshProgram);
    scene.activeMeshProgram = scene.programCache.get('a')!;
    scene.ibl = {
      brdfLut: {} as WebGLTexture,
      intensity: 1,
      irradianceCube: {} as WebGLTexture,
      prefilteredCube: {} as WebGLTexture,
      prefilteredMipCount: 5,
    } satisfies GlSceneIbl;
    scene.iblBakeFramebuffer = {} as WebGLFramebuffer;
    scene.environmentSourceCube = {} as WebGLTexture;
    const depthTexture = {} as WebGLTexture;
    scene.shadowTarget = {
      colorRenderbuffers: [],
      depthStencilRenderbuffer: null,
      depthTexture,
      framebuffer: {} as WebGLFramebuffer,
      resolveFramebuffer: null,
      textures: [],
    } as unknown as GlRenderTarget;
    scene.shadow = { matrix: {} as Matrix4, texture: depthTexture };
    scene.skinPalette = { jointCapacity: 4, texture: {} as WebGLTexture };

    destroyGlSceneRuntime(state);

    expect(gl.calls.filter((c) => c.name === 'deleteProgram').length).toBe(2);
    // 3 IBL textures + the environment source cube + the shadow depth texture (owned by the target) +
    // the skin-palette data texture.
    expect(gl.calls.filter((c) => c.name === 'deleteTexture').length).toBe(6);
    // The IBL bake framebuffer + the shadow target's framebuffer.
    expect(gl.calls.filter((c) => c.name === 'deleteFramebuffer').length).toBe(2);

    expect(scene.programCache.size).toBe(0);
    expect(scene.activeMeshProgram).toBeNull();
    expect(scene.ibl).toBeNull();
    expect(scene.iblBakeFramebuffer).toBeNull();
    expect(scene.environmentSourceCube).toBeNull();
    expect(scene.shadowTarget).toBeNull();
    expect(scene.shadow).toBeNull();
    expect(scene.skinPalette).toBeNull();
  });
});

describe('ensureGlSkinPalette', () => {
  it('creates the palette texture lazily on first call and reuses it after', () => {
    const { state } = makeGlSceneState();
    expect(getGlSceneRuntime(state).skinPalette).toBeNull();

    const first = ensureGlSkinPalette(state);
    expect(first).toBe(getGlSceneRuntime(state).skinPalette);
    expect(first.jointCapacity).toBe(0);

    const second = ensureGlSkinPalette(state);
    expect(second).toBe(first);
  });
});

describe('getGlSceneRuntime', () => {
  it('lazily allocates one runtime per state and returns the same instance', () => {
    const { state } = makeGlSceneState();
    const first = getGlSceneRuntime(state);
    expect(first.activeMeshProgram).toBeNull();
    expect(first.blendedDrawList).toBeInstanceOf(Array);
    expect(first.blendedPool).toBeInstanceOf(Array);
    expect(first.materialRegistry).toBeInstanceOf(Map);
    expect(first.opaqueDrawList).toBeInstanceOf(Array);
    expect(first.opaquePool).toBeInstanceOf(Array);
    expect(first.programCache).toBeInstanceOf(Map);
    expect(getGlSceneRuntime(state)).toBe(first);
  });

  it('gives each render state its own draw-entry pools, not shared singletons', () => {
    const { state: stateA } = makeGlSceneState();
    const { state: stateB } = makeGlSceneState();
    const rtA = getGlSceneRuntime(stateA);
    const rtB = getGlSceneRuntime(stateB);
    expect(rtA.opaquePool).not.toBe(rtB.opaquePool);
    expect(rtA.blendedPool).not.toBe(rtB.blendedPool);
    expect(rtA.opaqueDrawList).not.toBe(rtB.opaqueDrawList);
    expect(rtA.blendedDrawList).not.toBe(rtB.blendedDrawList);
  });

  it('surfaces its registry and upload cache through the header runtime slots', () => {
    const { state } = makeGlSceneState();
    const scene = getGlSceneRuntime(state);
    const stateRuntime = state[EntityRuntimeKey] as GlRenderStateRuntime;
    expect(stateRuntime.sceneMeshMaterialRegistry).toBe(scene.materialRegistry);
    expect(stateRuntime.sceneMeshUploadCache).toBe(scene.uploadCache);
  });
});
