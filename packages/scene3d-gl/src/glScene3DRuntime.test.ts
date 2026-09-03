import type {
  GlRenderStateRuntime,
  GlRenderTarget,
  Matrix4,
  GlMeshProgram,
  GlScene3DIbl,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  destroyGlScene3DRuntime,
  ensureGlSkinNormalPalette,
  ensureGlSkinPalette,
  getGlScene3DRuntime,
} from './glScene3DRuntime';
import { makeGlScene3DState } from './glScene3DTestHelper';

describe('destroyGlScene3DRuntime', () => {
  it('is a safe no-op when the state never allocated a scene runtime', () => {
    const { state, gl } = makeGlScene3DState();
    destroyGlScene3DRuntime(state);
    expect(gl.calls.some((c) => c.name.startsWith('delete'))).toBe(false);
  });

  it('clears an allocated runtime with no optional GPU resources', () => {
    const { state, gl } = makeGlScene3DState();
    const scene = getGlScene3DRuntime(state);

    destroyGlScene3DRuntime(state);

    expect(gl.calls.some((c) => c.name.startsWith('delete'))).toBe(false);
    expect(scene.blendedDrawList).toHaveLength(0);
    expect(scene.opaqueDrawList).toHaveLength(0);
  });

  it('frees the cached programs, the IBL set, the environment cube, and the shadow target, then clears the slots', () => {
    const { state, gl } = makeGlScene3DState();
    const scene = getGlScene3DRuntime(state);

    scene.programCache.set('a', { program: {} as WebGLProgram } as GlMeshProgram);
    scene.programCache.set('b', { program: {} as WebGLProgram } as GlMeshProgram);
    scene.activeMeshProgram = scene.programCache.get('a')!;
    scene.ibl = {
      brdfLut: {} as WebGLTexture,
      intensity: 1,
      irradianceCube: {} as WebGLTexture,
      prefilteredCube: {} as WebGLTexture,
      prefilteredMipCount: 5,
    } satisfies GlScene3DIbl;
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
    scene.shadow = {
      enabled: true,
      matrix: {} as Matrix4,
      normalBiasWorld: 0,
      pcfRadius: 0,
      shadowBias: 0,
      texture: depthTexture,
    };
    scene.skinPalette = { [EntityRuntimeKey]: undefined, jointCapacity: 4, texture: {} as WebGLTexture };

    destroyGlScene3DRuntime(state);

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

describe('ensureGlSkinNormalPalette', () => {
  it('creates a SEPARATE texture from the pose palette and reuses it after', () => {
    // ★ THE TWO MUST NOT BE THE SAME OBJECT. They carry different data at different texel strides — four
    // texels per joint for the pose matrix, three for the normal matrix — so aliasing them would upload
    // one over the other every frame and corrupt whichever wrote second.
    const { state } = makeGlScene3DState();
    expect(getGlScene3DRuntime(state).skinNormalPalette).toBeNull();

    const first = ensureGlSkinNormalPalette(state);
    expect(first).toBe(getGlScene3DRuntime(state).skinNormalPalette);
    expect(first).not.toBe(ensureGlSkinPalette(state));

    expect(ensureGlSkinNormalPalette(state)).toBe(first);
  });
});

describe('ensureGlSkinPalette', () => {
  it('creates the palette texture lazily on first call and reuses it after', () => {
    const { state } = makeGlScene3DState();
    expect(getGlScene3DRuntime(state).skinPalette).toBeNull();

    const first = ensureGlSkinPalette(state);
    expect(first).toBe(getGlScene3DRuntime(state).skinPalette);
    expect(first.jointCapacity).toBe(0);

    const second = ensureGlSkinPalette(state);
    expect(second).toBe(first);
  });
});

describe('getGlScene3DRuntime', () => {
  it('lazily allocates one runtime per state and returns the same instance', () => {
    const { state } = makeGlScene3DState();
    const first = getGlScene3DRuntime(state);
    expect(first.activeBlendedRun).toBe(false);
    expect(first.activeMeshProgram).toBeNull();
    expect(first.blendedDrawList).toBeInstanceOf(Array);
    expect(first.blendedPool).toBeInstanceOf(Array);
    expect(first.opaqueDrawList).toBeInstanceOf(Array);
    expect(first.opaquePool).toBeInstanceOf(Array);
    expect(first.programCache).toBeInstanceOf(Map);
    expect(getGlScene3DRuntime(state)).toBe(first);
  });

  it('gives each render state its own draw-entry pools, not shared singletons', () => {
    const { state: stateA } = makeGlScene3DState();
    const { state: stateB } = makeGlScene3DState();
    const rtA = getGlScene3DRuntime(stateA);
    const rtB = getGlScene3DRuntime(stateB);
    expect(rtA.opaquePool).not.toBe(rtB.opaquePool);
    expect(rtA.blendedPool).not.toBe(rtB.blendedPool);
    expect(rtA.opaqueDrawList).not.toBe(rtB.opaqueDrawList);
    expect(rtA.blendedDrawList).not.toBe(rtB.blendedDrawList);
  });

  it('surfaces its upload cache without replacing persistent material dispatch policy', () => {
    const { state } = makeGlScene3DState();
    const stateRuntime = state[EntityRuntimeKey] as GlRenderStateRuntime;
    const materials = stateRuntime.registries.meshMaterialRenderers;
    const modifierSnippets = stateRuntime.registries.modifierSnippets;
    const modifierSnippetRevision = stateRuntime.registries.modifierSnippetRevision;
    const pbrExtensions = stateRuntime.registries.pbrExtensions;
    const pbrExtensionRevision = stateRuntime.registries.pbrExtensionRevision;
    const scene = getGlScene3DRuntime(state);
    expect(stateRuntime.registries.meshMaterialRenderers).toBe(materials);
    expect(stateRuntime.registries.modifierSnippets).toBe(modifierSnippets);
    expect(stateRuntime.registries.modifierSnippetRevision).toBe(modifierSnippetRevision);
    expect(stateRuntime.registries.pbrExtensions).toBe(pbrExtensions);
    expect(stateRuntime.registries.pbrExtensionRevision).toBe(pbrExtensionRevision);
    expect(stateRuntime.context.sceneMeshUploadCache).toBe(scene.uploadCache);
  });
});
