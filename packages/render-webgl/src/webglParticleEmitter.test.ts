import type { SpriteRenderNode } from '@flighthq/types';

import { defaultWebGLParticleEmitterRenderer, drawWebGLParticleEmitter } from './webglParticleEmitter';
import { makeWebGLState } from './webglTestHelper';

function makeAtlas() {
  const img = document.createElement('img');
  return {
    image: { src: img, width: 64, height: 64 },
    regions: [{ id: 0, x: 0, y: 0, width: 32, height: 32 }],
  };
}

function makeParticleEmitterNode(data: Record<string, unknown> = {}): SpriteRenderNode {
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
  } as unknown as SpriteRenderNode;
}

describe('defaultWebGLParticleEmitterRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultWebGLParticleEmitterRenderer.createData).toBe('function');
  });

  it('has a draw function pointing to drawWebGLParticleEmitter', () => {
    expect(defaultWebGLParticleEmitterRenderer.draw).toBe(drawWebGLParticleEmitter);
  });
});

describe('drawWebGLParticleEmitter', () => {
  it('returns early without drawing when atlas is null', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLParticleEmitter(state, makeParticleEmitterNode({ atlas: null }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas.image is null', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLParticleEmitter(state, makeParticleEmitterNode({ atlas: { image: null, regions: [] } }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas.image.src is null', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLParticleEmitter(state, makeParticleEmitterNode({ atlas: { image: { src: null }, regions: [] } }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early without drawing when particleCount is 0', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLParticleEmitter(state, makeParticleEmitterNode({ particleCount: 0 }));
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('draws all live particles in a single instanced draw call', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLParticleEmitter(
      state,
      makeParticleEmitterNode({
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
    const { state, gl } = makeWebGLState();
    drawWebGLParticleEmitter(
      state,
      makeParticleEmitterNode({
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
