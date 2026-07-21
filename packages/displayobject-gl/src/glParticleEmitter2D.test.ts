import type { RenderProxy2D } from '@flighthq/types';

import { defaultGlParticleEmitter2DRenderer, drawGlParticleEmitter2D } from './glParticleEmitter2D';
import { createGlState } from './glTestHelper';

function makeAtlas() {
  const img = document.createElement('img');
  return {
    image: { source: img, width: 64, height: 64 },
    regions: [{ id: 0, x: 0, y: 0, width: 32, height: 32 }],
  };
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
    const { state, gl } = createGlState();
    drawGlParticleEmitter2D(state, makeParticleEmitter2DNode({ atlas: null }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas.image is null', () => {
    const { state, gl } = createGlState();
    drawGlParticleEmitter2D(state, makeParticleEmitter2DNode({ atlas: { image: null, regions: [] } }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas.image.source is null', () => {
    const { state, gl } = createGlState();
    drawGlParticleEmitter2D(state, makeParticleEmitter2DNode({ atlas: { image: { source: null }, regions: [] } }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early without drawing when particleCount is 0', () => {
    const { state, gl } = createGlState();
    drawGlParticleEmitter2D(state, makeParticleEmitter2DNode({ particleCount: 0 }));
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('draws all live particles in a single instanced draw call', () => {
    const { state, gl } = createGlState();
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
    const { state, gl } = createGlState();
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
});
