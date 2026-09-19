import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createWebGlContext } from '@flighthq/host-web/contract';
import { allocateEmptyGlRenderRegistries, createGlRenderState, endGlRenderPass } from '@flighthq/render-gl/contract';
import type { RenderEffect } from '@flighthq/types/contract';

import {
  beginGlEffectState,
  createGlEffectState,
  destroyGlEffectState,
  endGlEffectState,
  initializeGlEffectState,
  setGlEffectStateSkipGuard,
  setGlRenderEffectVelocityTexture,
} from './glEffectState';

describe('beginGlEffectState', () => {
  it('is a function', () => {
    expect(typeof beginGlEffectState).toBe('function');
  });

  it('redeclares the explicit color space on a reused scene target', () => {
    const state = createGlRenderState(
      createWebGlContext(document.createElement('canvas')),
      allocateEmptyGlRenderRegistries(),
    );
    const pipeline = createGlEffectState(state);

    const pass = beginGlEffectState(state, pipeline);
    const target = pipeline.sceneTarget;
    endGlRenderPass(pass);
    beginGlEffectState(state, pipeline, undefined, 'linear');

    expect(pipeline.sceneTarget).toBe(target);
    expect(target?.colorSpace).toBe('linear');
  });
});

describe('createGlEffectState', () => {
  it('is a function', () => {
    expect(typeof createGlEffectState).toBe('function');
  });
});

describe('destroyGlEffectState', () => {
  it('is a function', () => {
    expect(typeof destroyGlEffectState).toBe('function');
  });
});

describe('endGlEffectState', () => {
  it('is a function', () => {
    expect(typeof endGlEffectState).toBe('function');
  });
});

describe('initializeGlEffectState', () => {
  it('is the construction initializer of createGlEffectState', () => {
    expect(typeof initializeGlEffectState).toBe('function');
  });
});

describe('setGlEffectStateSkipGuard', () => {
  it('reports every effect kind the pass drops, and goes silent again when cleared', () => {
    const state = createGlRenderState(
      createWebGlContext(document.createElement('canvas')),
      allocateEmptyGlRenderRegistries(),
    );
    const pipeline = createGlEffectState(state);
    const dropped: string[] = [];
    const chain = [
      (() => {
        const out = allocateEntity<any>();
        out.kind = 'test.pipeline-skip-seam';
        return finishEntity(out);
      })() as RenderEffect,
    ];

    setGlEffectStateSkipGuard(state, (_state, kind) => dropped.push(kind));
    let pass = beginGlEffectState(state, pipeline);
    endGlEffectState(pass, pipeline, chain);

    expect(dropped).toEqual(['test.pipeline-skip-seam']);

    // Clearing must restore the original silence exactly: the seam is the ONLY path by which a dropped
    // effect is observable, so a stale guard would be the difference between a diagnostic and a leak.
    setGlEffectStateSkipGuard(state, null);
    pass = beginGlEffectState(state, pipeline);
    endGlEffectState(pass, pipeline, chain);

    expect(dropped).toEqual(['test.pipeline-skip-seam']);
  });
});
describe('setGlRenderEffectVelocityTexture', () => {
  it('is a function', () => {
    expect(typeof setGlRenderEffectVelocityTexture).toBe('function');
  });
});
