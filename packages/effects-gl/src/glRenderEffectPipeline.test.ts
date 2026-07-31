import { createGlRenderState, endGlRenderPass } from '@flighthq/render-gl/contract';

import {
  beginGlRenderEffectPipeline,
  createGlRenderEffectPipeline,
  destroyGlRenderEffectPipeline,
  endGlRenderEffectPipeline,
  setGlRenderEffectVelocityTexture,
} from './glRenderEffectPipeline';

describe('beginGlRenderEffectPipeline', () => {
  it('is a function', () => {
    expect(typeof beginGlRenderEffectPipeline).toBe('function');
  });

  it('redeclares the explicit color space on a reused scene target', () => {
    const state = createGlRenderState(document.createElement('canvas'));
    const pipeline = createGlRenderEffectPipeline(state);

    beginGlRenderEffectPipeline(state, pipeline);
    const target = pipeline.sceneTarget;
    endGlRenderPass(state);
    beginGlRenderEffectPipeline(state, pipeline, 'linear');

    expect(pipeline.sceneTarget).toBe(target);
    expect(target?.colorSpace).toBe('linear');
  });
});

describe('createGlRenderEffectPipeline', () => {
  it('is a function', () => {
    expect(typeof createGlRenderEffectPipeline).toBe('function');
  });
});

describe('destroyGlRenderEffectPipeline', () => {
  it('is a function', () => {
    expect(typeof destroyGlRenderEffectPipeline).toBe('function');
  });
});

describe('endGlRenderEffectPipeline', () => {
  it('is a function', () => {
    expect(typeof endGlRenderEffectPipeline).toBe('function');
  });
});

describe('setGlRenderEffectVelocityTexture', () => {
  it('is a function', () => {
    expect(typeof setGlRenderEffectVelocityTexture).toBe('function');
  });
});
