import { createImageResource } from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { RenderProxy2D } from '@flighthq/types/contract';

import { registerCanvasImageTextureResolver } from './canvasImageTextureResolver';
import { drawCanvasParticleEmitter2D } from './canvasParticleEmitter2D';
import { getCanvasRenderStateTextureResolvers } from './canvasTestSupport';
import { createCanvasRenderState } from './canvasTestSupport';

function makeAtlas() {
  const img = document.createElement('img') as HTMLImageElement;
  const image = createImageResource(img);
  image.width = 64;
  image.height = 64;
  return {
    regions: [{ id: 0, x: 0, y: 0, width: 32, height: 32 }],
    texture: createTexture({ dimension: '2d', source: image }),
  };
}

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 400;
  const state = createCanvasRenderState(canvas, {});
  registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
  return state;
}

function makeRenderProxy(data: Record<string, unknown> = {}): RenderProxy2D {
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
    blendMode: null,
    alpha: 1,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  } as unknown as RenderProxy2D;
}

describe('drawCanvasParticleEmitter2D', () => {
  it('calls drawImage once for a single live particle', () => {
    const state = makeState();
    const spy = vi.spyOn(state.context, 'drawImage');
    drawCanvasParticleEmitter2D(state, makeRenderProxy());
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('calls drawImage once per live particle', () => {
    const state = makeState();
    const spy = vi.spyOn(state.context, 'drawImage');
    drawCanvasParticleEmitter2D(
      state,
      makeRenderProxy({
        particleCount: 3,
        ids: new Uint16Array([0, 0, 0]),
        transforms: new Float32Array([0, 0, 0, 1, 10, 10, 0, 1, 20, 20, 0, 1]),
        alphas: new Float32Array([1, 0.5, 0.25]),
        colors: new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1]),
      }),
    );
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('skips drawing when atlas is null', () => {
    const state = makeState();
    const spy = vi.spyOn(state.context, 'drawImage');
    drawCanvasParticleEmitter2D(state, makeRenderProxy({ atlas: null }));
    expect(spy).not.toHaveBeenCalled();
  });

  it('skips drawing when particleCount is 0', () => {
    const state = makeState();
    const spy = vi.spyOn(state.context, 'drawImage');
    drawCanvasParticleEmitter2D(state, makeRenderProxy({ particleCount: 0 }));
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not throw on NaN particle transforms', () => {
    const state = makeState();
    expect(() =>
      drawCanvasParticleEmitter2D(
        state,
        makeRenderProxy({
          transforms: new Float32Array([Number.NaN, Number.NaN, Number.NaN, Number.NaN]),
        }),
      ),
    ).not.toThrow();
  });

  it('skips particles with out-of-range region ids', () => {
    const state = makeState();
    const spy = vi.spyOn(state.context, 'drawImage');
    drawCanvasParticleEmitter2D(
      state,
      makeRenderProxy({
        particleCount: 3,
        ids: new Uint16Array([0, 99, 0]),
        transforms: new Float32Array([0, 0, 0, 1, 10, 10, 0, 1, 20, 20, 0, 1]),
        alphas: new Float32Array([1, 1, 1]),
        colors: new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1]),
      }),
    );
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
