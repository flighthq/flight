import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import {
  createGlContextState,
  createEmptyGlRegistries,
  createGlPipeline,
  createGlContextFromCanvasElement,
  createGlRenderState,
  endGlRenderPass,
} from '@flighthq/render-gl/contract';
import type { RenderEffect } from '@flighthq/types/contract';

import {
  beginGlRenderEffectPipeline,
  createGlRenderEffectPipeline,
  destroyGlRenderEffectPipeline,
  endGlRenderEffectPipeline,
  setGlRenderEffectPipelineSkipGuard,
  setGlRenderEffectVelocityTexture,
} from './glRenderEffectPipeline';

describe('beginGlRenderEffectPipeline', () => {
  it('is a function', () => {
    expect(typeof beginGlRenderEffectPipeline).toBe('function');
  });

  it('redeclares the explicit color space on a reused scene target', () => {
    const state = createGlRenderState(
      createGlContextState(createGlContextFromCanvasElement(document.createElement('canvas'))),
      createGlPipeline(createEmptyGlRegistries()),
    );
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

describe('setGlRenderEffectPipelineSkipGuard', () => {
  it('reports every effect kind the pass drops, and goes silent again when cleared', () => {
    const state = createGlRenderState(
      createGlContextState(createGlContextFromCanvasElement(document.createElement('canvas'))),
      createGlPipeline(createEmptyGlRegistries()),
    );
    const pipeline = createGlRenderEffectPipeline(state);
    const dropped: string[] = [];
    const chain = [
      (() => {
        const out = allocateEntity<any>();
        out.kind = 'test.pipeline-skip-seam';
        return finishEntity(out);
      })() as RenderEffect,
    ];

    setGlRenderEffectPipelineSkipGuard(state, (_state, kind) => dropped.push(kind));
    beginGlRenderEffectPipeline(state, pipeline);
    endGlRenderEffectPipeline(state, pipeline, chain);

    expect(dropped).toEqual(['test.pipeline-skip-seam']);

    // Clearing must restore the original silence exactly: the seam is the ONLY path by which a dropped
    // effect is observable, so a stale guard would be the difference between a diagnostic and a leak.
    setGlRenderEffectPipelineSkipGuard(state, null);
    beginGlRenderEffectPipeline(state, pipeline);
    endGlRenderEffectPipeline(state, pipeline, chain);

    expect(dropped).toEqual(['test.pipeline-skip-seam']);
  });
});

describe('setGlRenderEffectVelocityTexture', () => {
  it('is a function', () => {
    expect(typeof setGlRenderEffectVelocityTexture).toBe('function');
  });
});
