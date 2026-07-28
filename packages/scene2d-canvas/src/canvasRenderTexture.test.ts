import { createRenderTexture } from '@flighthq/texture/contract';

import { createCanvasRenderState } from './canvasRenderState';
import {
  bindCanvasRenderTexture,
  destroyCanvasRenderTexture,
  renderIntoCanvasRenderTexture,
} from './canvasRenderTexture';

describe('bindCanvasRenderTexture', () => {
  it('returns null before the texture is populated and its canvas afterward', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const texture = createRenderTexture({ height: 16, width: 32 });
    expect(bindCanvasRenderTexture(state, texture)).toBeNull();
    renderIntoCanvasRenderTexture(state, texture, () => {});
    expect(bindCanvasRenderTexture(state, texture)).toBeInstanceOf(HTMLCanvasElement);
  });
});

describe('destroyCanvasRenderTexture', () => {
  it('releases the state-owned target', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const texture = createRenderTexture({ height: 16, width: 32 });
    renderIntoCanvasRenderTexture(state, texture, () => {});
    destroyCanvasRenderTexture(state, texture);
    expect(bindCanvasRenderTexture(state, texture)).toBeNull();
  });
});

describe('renderIntoCanvasRenderTexture', () => {
  it('redirects drawing, restores the screen state, and advances the version', () => {
    const canvas = document.createElement('canvas');
    const state = createCanvasRenderState(canvas);
    const texture = createRenderTexture({ height: 16, width: 32 });
    const initialVersion = texture.version;

    renderIntoCanvasRenderTexture(state, texture, (targetState) => {
      expect(targetState.canvas).not.toBe(canvas);
      expect(targetState.canvas.width).toBe(32);
      expect(targetState.canvas.height).toBe(16);
    });

    expect(state.canvas).toBe(canvas);
    expect(texture.version).toBe((initialVersion + 1) >>> 0);
  });

  it('rejects a Texture without a render-target backing and restores state when drawing throws', () => {
    const canvas = document.createElement('canvas');
    const state = createCanvasRenderState(canvas);
    const texture = createRenderTexture({ height: 16, width: 32 });
    texture.storage.target = undefined;
    expect(() => renderIntoCanvasRenderTexture(state, texture, () => {})).toThrow(
      'renderIntoCanvasRenderTexture requires a Texture with a render-target backing',
    );

    texture.storage.target = {
      height: 16,
      kind: 'renderTexture',
      width: 32,
    };
    expect(() =>
      renderIntoCanvasRenderTexture(state, texture, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(state.canvas).toBe(canvas);
    expect(bindCanvasRenderTexture(state, texture)).toBeNull();
    expect(texture.version).toBe(0);
  });
});
