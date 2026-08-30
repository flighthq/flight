import { createImageResource } from '@flighthq/image/contract';
import {
  getGlRenderStateRuntime,
  registerGlCompressedImageTextureResolver,
  registerGlImageTextureResolver,
} from '@flighthq/render-gl/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { CompressedImage, RenderProxy2D } from '@flighthq/types/contract';
import { CompressedImageTextureSourceKind, RegistryEntryState } from '@flighthq/types/contract';

import { defaultGlParticleEmitter2DRenderer, drawGlParticleEmitter2D } from './glParticleEmitter2D';
import { createGlState } from './glTestHelper';

function makeAtlas() {
  const img = document.createElement('img');
  const image = createImageResource(img);
  image.width = 64;
  image.height = 64;
  return {
    regions: [{ id: 0, x: 0, y: 0, width: 32, height: 32 }],
    texture: createTexture({ dimension: '2d', source: image }),
  };
}

function createAtlasGlState() {
  const result = createGlState();
  registerGlImageTextureResolver(result.state);
  return result;
}

function makeParticleEmitter2DNode(data: Record<string, unknown> = {}): RenderProxy2D {
  return {
    source: {
      data: {
        atlas: makeAtlas(),
        particleCount: 1,
        ids: new Uint16Array([0]),
        transforms: new Float32Array([0, 0, 0, 1]),
        alphas: new Float32Array([1]),
        colors: new Float32Array([1, 1, 1]),
        ...data,
      },
    },
    blendMode: 0,
    alpha: 1,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  } as unknown as RenderProxy2D;
}

describe('defaultGlParticleEmitter2DRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultGlParticleEmitter2DRenderer.createData).toBe('function');
  });

  it('has a submit function', () => {
    expect(typeof defaultGlParticleEmitter2DRenderer.submit).toBe('function');
  });
});

describe('drawGlParticleEmitter2D', () => {
  it('returns early without drawing when atlas is null', () => {
    const { state, gl } = createAtlasGlState();
    drawGlParticleEmitter2D(state, makeParticleEmitter2DNode({ atlas: null }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas.texture is null', () => {
    const { state, gl } = createAtlasGlState();
    drawGlParticleEmitter2D(state, makeParticleEmitter2DNode({ atlas: { regions: [], texture: null } }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas Texture is unbound', () => {
    const { state, gl } = createAtlasGlState();
    drawGlParticleEmitter2D(state, makeParticleEmitter2DNode({ atlas: { regions: [], texture: createTexture() } }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early without drawing when particleCount is 0', () => {
    const { state, gl } = createAtlasGlState();
    drawGlParticleEmitter2D(state, makeParticleEmitter2DNode({ particleCount: 0 }));
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('draws all live particles in a single instanced draw call', () => {
    const { state, gl } = createAtlasGlState();
    drawGlParticleEmitter2D(
      state,
      makeParticleEmitter2DNode({
        particleCount: 3,
        ids: new Uint16Array([0, 0, 0]),
        transforms: new Float32Array([0, 0, 0, 1, 10, 10, 0, 1, 20, 20, 0, 1]),
        alphas: new Float32Array([1, 0.5, 0.25]),
        colors: new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1]),
      }),
    );
    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(expect.anything(), 6, expect.anything(), 0, 3);
  });

  it('skips out-of-range region ids and draws only valid particles', () => {
    const { state, gl } = createAtlasGlState();
    drawGlParticleEmitter2D(
      state,
      makeParticleEmitter2DNode({
        particleCount: 3,
        ids: new Uint16Array([0, 99, 0]),
        transforms: new Float32Array([0, 0, 0, 1, 10, 10, 0, 1, 20, 20, 0, 1]),
        alphas: new Float32Array([1, 1, 1]),
        colors: new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1]),
      }),
    );
    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(expect.anything(), 6, expect.anything(), 0, 2);
  });

  it('uploads the straight-alpha flag for a compressed particle atlas', () => {
    const { state, gl } = createAtlasGlState();
    registerGlCompressedImageTextureResolver(state);
    const runtime = getGlRenderStateRuntime(state);
    runtime.registries.compressedTextureUpload = {
      ...runtime.registries.compressedTextureUpload,
      entry: { state: RegistryEntryState.Bound, value: () => true },
    };
    const image = {
      compressed: { container: {}, payload: new Uint8Array() },
      height: 4,
      kind: CompressedImageTextureSourceKind,
      version: 1,
      width: 4,
    } as unknown as CompressedImage;

    drawGlParticleEmitter2D(
      state,
      makeParticleEmitter2DNode({
        atlas: {
          regions: [{ id: 0, x: 0, y: 0, width: 4, height: 4 }],
          texture: createTexture({ dimension: '2d', source: image }),
        },
      }),
    );

    const shader = getGlRenderStateRuntime(state).context.particleResources!.shader;
    expect(gl.uniform1i).toHaveBeenCalledWith(shader.locStraightTextureAlpha, 1);
  });
});
