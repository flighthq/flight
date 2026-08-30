import { createRenderTexture } from '@flighthq/texture/contract';

import {
  bindCanvasRenderTexture,
  destroyCanvasRenderTexture,
  explainCanvasRenderTexture,
  getCanvasRenderTextureTarget,
  invalidateCanvasRenderTexture,
  isCanvasRenderTextureReady,
  renderIntoCanvasRenderTexture,
  writeCanvasRenderTextureTarget,
} from './canvasRenderTexture';
import { createCanvasRenderState, destroyCanvasRenderState } from './canvasTestSupport';

describe('bindCanvasRenderTexture', () => {
  it('returns null before the texture is populated and its canvas afterward', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const texture = createRenderTexture({ height: 16, width: 32 });
    expect(bindCanvasRenderTexture(state, texture)).toBeNull();
    renderIntoCanvasRenderTexture(state, state, texture, () => {});
    expect(bindCanvasRenderTexture(state, texture)).toBeInstanceOf(HTMLCanvasElement);
  });
});

describe('destroyCanvasRenderTexture', () => {
  it('releases the state-owned target', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const texture = createRenderTexture({ height: 16, width: 32 });
    renderIntoCanvasRenderTexture(state, state, texture, () => {});
    destroyCanvasRenderTexture(state, texture);
    expect(bindCanvasRenderTexture(state, texture)).toBeNull();
  });

  it('releases every target when its explicit owner is destroyed', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const texture = createRenderTexture({ height: 16, width: 32 });
    renderIntoCanvasRenderTexture(state, state, texture, () => {});
    const target = getCanvasRenderTextureTarget(state, texture)!;

    destroyCanvasRenderState(state);

    expect(target.canvas.width).toBe(0);
    expect(target.canvas.height).toBe(0);
    expect(bindCanvasRenderTexture(state, texture)).toBeNull();
  });
});

describe('explainCanvasRenderTexture', () => {
  it('reports descriptor dimensions and unrendered status before allocation', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const texture = createRenderTexture({ height: 12, width: 20 });
    expect(explainCanvasRenderTexture(state, texture)).toEqual({ height: 12, status: 'unrendered', width: 20 });
  });
});

describe('getCanvasRenderTextureTarget', () => {
  it('returns only completed targets', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const texture = createRenderTexture({ height: 12, width: 20 });
    expect(getCanvasRenderTextureTarget(state, texture)).toBeNull();
    renderIntoCanvasRenderTexture(state, state, texture, () => {});
    expect(getCanvasRenderTextureTarget(state, texture)).not.toBeNull();
  });
});

describe('invalidateCanvasRenderTexture', () => {
  it('changes a completed target to the requested non-ready status', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const texture = createRenderTexture({ height: 12, width: 20 });
    renderIntoCanvasRenderTexture(state, state, texture, () => {});
    invalidateCanvasRenderTexture(state, texture, 'released');
    expect(explainCanvasRenderTexture(state, texture).status).toBe('released');
  });
});

describe('isCanvasRenderTextureReady', () => {
  it('tracks whether the handle owns completed content', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const texture = createRenderTexture({ height: 12, width: 20 });
    expect(isCanvasRenderTextureReady(state, texture)).toBe(false);
    renderIntoCanvasRenderTexture(state, state, texture, () => {});
    expect(isCanvasRenderTextureReady(state, texture)).toBe(true);
  });
});

describe('renderIntoCanvasRenderTexture', () => {
  it('redirects drawing, restores the screen state, and advances the version', () => {
    const canvas = document.createElement('canvas');
    const state = createCanvasRenderState(canvas);
    const texture = createRenderTexture({ height: 16, width: 32 });
    const initialVersion = texture.version;

    renderIntoCanvasRenderTexture(state, state, texture, (targetState) => {
      expect(targetState.canvas).not.toBe(canvas);
      expect(targetState.canvas.width).toBe(32);
      expect(targetState.canvas.height).toBe(16);
    });

    expect(state.canvas).toBe(canvas);
    expect(texture.version).toBe((initialVersion + 1) >>> 0);
  });

  it('restores state when drawing throws', () => {
    const canvas = document.createElement('canvas');
    const state = createCanvasRenderState(canvas);
    const texture = createRenderTexture({ height: 16, width: 32 });
    expect(() =>
      renderIntoCanvasRenderTexture(state, state, texture, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(state.canvas).toBe(canvas);
    expect(bindCanvasRenderTexture(state, texture)).toBeNull();
    expect(texture.version).toBe(0);
  });
});

describe('writeCanvasRenderTextureTarget', () => {
  it('publishes a raw target for effect recipes', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const texture = createRenderTexture({ height: 12, width: 20 });

    writeCanvasRenderTextureTarget(state, texture, (target) => {
      expect(target.width).toBe(20);
      expect(target.height).toBe(12);
    });

    expect(isCanvasRenderTextureReady(state, texture)).toBe(true);
    expect(getCanvasRenderTextureTarget(state, texture)?.canvas).toBe(bindCanvasRenderTexture(state, texture));
    expect(explainCanvasRenderTexture(state, texture)).toEqual({ height: 12, status: 'ready', width: 20 });
  });

  it('does not publish a failed effect write', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const texture = createRenderTexture({ height: 12, width: 20 });

    expect(() =>
      writeCanvasRenderTextureTarget(state, texture, () => {
        throw new Error('effect failed');
      }),
    ).toThrow('effect failed');

    expect(isCanvasRenderTextureReady(state, texture)).toBe(false);
    expect(explainCanvasRenderTexture(state, texture).status).toBe('unrendered');
  });
});
