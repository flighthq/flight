import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createWebGlContext } from '@flighthq/host-web/contract';
import { createGlRenderState, endGlRenderPass } from '@flighthq/render-gl/contract';
import type { Effect } from '@flighthq/types/contract';

import {
  beginGlEffectPass,
  createGlEffectState,
  destroyGlEffectState,
  endGlEffectPass,
  initializeGlEffectState,
  setGlEffectStateSkipGuard,
  setGlEffectVelocityTexture,
} from './glEffectState';

describe('beginGlEffectPass', () => {
  it('is a function', () => {
    expect(typeof beginGlEffectPass).toBe('function');
  });

  it('redeclares the explicit color space on a reused scene target', () => {
    const state = createGlRenderState(createWebGlContext(document.createElement('canvas')));
    const pipeline = createGlEffectState(state);

    const pass = beginGlEffectPass(state, pipeline);
    const target = pipeline.sceneTarget;
    endGlRenderPass(pass);
    beginGlEffectPass(state, pipeline, undefined, 'linear');

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

describe('endGlEffectPass', () => {
  it('is a function', () => {
    expect(typeof endGlEffectPass).toBe('function');
  });
});

describe('initializeGlEffectState', () => {
  it('is the construction initializer of createGlEffectState', () => {
    expect(typeof initializeGlEffectState).toBe('function');
  });
});

describe('setGlEffectStateSkipGuard', () => {
  it('reports every effect kind the pass drops, and goes silent again when cleared', () => {
    const state = createGlRenderState(createWebGlContext(document.createElement('canvas')));
    const pipeline = createGlEffectState(state);
    const dropped: string[] = [];
    const chain = [
      (() => {
        const out = allocateEntity<any>();
        out.kind = 'test.pipeline-skip-seam';
        return finishEntity(out);
      })() as Effect,
    ];

    setGlEffectStateSkipGuard(state, (_state, kind) => dropped.push(kind));
    let pass = beginGlEffectPass(state, pipeline);
    endGlEffectPass(pass, pipeline, chain);

    expect(dropped).toEqual(['test.pipeline-skip-seam']);

    // Clearing must restore the original silence exactly: the seam is the ONLY path by which a dropped
    // effect is observable, so a stale guard would be the difference between a diagnostic and a leak.
    setGlEffectStateSkipGuard(state, null);
    pass = beginGlEffectPass(state, pipeline);
    endGlEffectPass(pass, pipeline, chain);

    expect(dropped).toEqual(['test.pipeline-skip-seam']);
  });
});
describe('setGlEffectVelocityTexture', () => {
  it('is a function', () => {
    expect(typeof setGlEffectVelocityTexture).toBe('function');
  });
});
