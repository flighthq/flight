import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import type { RenderTexture } from '@flighthq/types/contract';

import { enableGlRenderTextureGuards } from './enableGlRenderTextureGuards';
import { getGlRenderStateRuntime } from './glRenderState';
import {
  bindGlRenderTexture,
  destroyGlRenderTexture,
  explainGlRenderTexture,
  renderIntoGlRenderTexture,
} from './glRenderTexture';
import { createGlState } from './glTestHelper';

describe('bindGlRenderTexture', () => {
  it('binds the existing target texture without uploading pixels', () => {
    const { state, gl } = createRenderTextureState();
    const renderTexture = createRenderTexture({ height: 8, width: 8 });
    renderIntoGlRenderTexture(state, renderTexture, () => {});
    const uploads = vi.mocked(gl.texImage2D).mock.calls.length;

    const texture = bindGlRenderTexture(state, renderTexture);

    expect(texture).not.toBeNull();
    expect(gl.texImage2D).toHaveBeenCalledTimes(uploads);
    expect(getGlRenderStateRuntime(state).currentTexture).toBe(texture);
  });

  it('uses the null sentinel before the first render', () => {
    const { state } = createRenderTextureState();
    expect(bindGlRenderTexture(state, createRenderTexture({ height: 8, width: 8 }))).toBeNull();
    expect(getGlRenderStateRuntime(state).currentTexture).toBeNull();
  });
});

describe('destroyGlRenderTexture', () => {
  it('deletes the hidden target and returns the source to unrendered state', () => {
    const { state, gl } = createRenderTextureState();
    const renderTexture = createRenderTexture({ height: 8, width: 8 });
    renderIntoGlRenderTexture(state, renderTexture, () => {});

    destroyGlRenderTexture(state, renderTexture);

    expect(gl.deleteTexture).toHaveBeenCalled();
    expect(explainGlRenderTexture(state, renderTexture).status).toBe('unrendered');
  });
});

describe('enableGlRenderTextureGuards', () => {
  it('warns for unrendered and read-while-write sampling hazards', () => {
    const { state } = createRenderTextureState();
    const unrendered = createRenderTexture({ height: 8, width: 8 });
    const writing = createRenderTexture({ height: 8, width: 8 });
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    enableGlRenderTextureGuards(state);
    try {
      bindGlRenderTexture(state, unrendered);
      renderIntoGlRenderTexture(state, writing, () => {
        bindGlRenderTexture(state, writing);
      });

      const entries = getMemoryLogSinkEntries(sink);
      expect(entries).toHaveLength(2);
      expect(entries.map((entry) => (entry.data as { status: string }).status)).toEqual(['unrendered', 'writing']);
    } finally {
      removeLogSink(sink.sink);
    }
  });
});

describe('renderIntoGlRenderTexture', () => {
  it('lazily creates a target and marks it ready after the callback completes', () => {
    const { state } = createRenderTextureState();
    const renderTexture = createRenderTexture({ depth: true, height: 24, width: 32 });
    const callback = vi.fn((callbackState) => {
      expect(callbackState).toBe(state);
      expect(explainGlRenderTexture(state, renderTexture).status).toBe('writing');
    });

    expect(explainGlRenderTexture(state, renderTexture)).toEqual({
      height: 24,
      status: 'unrendered',
      width: 32,
    });

    renderIntoGlRenderTexture(state, renderTexture, callback);

    expect(callback).toHaveBeenCalledOnce();
    expect(explainGlRenderTexture(state, renderTexture)).toEqual({
      height: 24,
      status: 'ready',
      width: 32,
    });
    expect(getGlRenderStateRuntime(state).currentRenderTarget).toBeNull();
  });

  it('restores the pass and remains unrendered when the callback throws', () => {
    const { state } = createRenderTextureState();
    const renderTexture = createRenderTexture({ height: 8, width: 8 });

    expect(() =>
      renderIntoGlRenderTexture(state, renderTexture, () => {
        throw new Error('producer failed');
      }),
    ).toThrow('producer failed');

    expect(explainGlRenderTexture(state, renderTexture).status).toBe('unrendered');
    expect(getGlRenderStateRuntime(state).currentRenderTarget).toBeNull();
  });

  it('resizes the retained target when the source dimensions change', () => {
    const { state } = createRenderTextureState();
    const renderTexture = createRenderTexture({ height: 16, width: 32 });
    renderIntoGlRenderTexture(state, renderTexture, () => {});

    renderTexture.width = 12;
    renderTexture.height = 10;
    renderIntoGlRenderTexture(state, renderTexture, () => {});

    expect(explainGlRenderTexture(state, renderTexture)).toEqual({
      height: 10,
      status: 'ready',
      width: 12,
    });
  });

  it('rejects feedback sampling while writing and permits it after the pass', () => {
    const { state } = createRenderTextureState();
    const renderTexture = createRenderTexture({ height: 8, width: 8 });
    let whileWriting: WebGLTexture | null = {} as WebGLTexture;

    renderIntoGlRenderTexture(state, renderTexture, () => {
      whileWriting = bindGlRenderTexture(state, renderTexture);
    });

    expect(whileWriting).toBeNull();
    expect(bindGlRenderTexture(state, renderTexture)).not.toBeNull();
  });
});

function createRenderTextureState(): ReturnType<typeof createGlState> {
  const fixture = createGlState();
  const { gl } = fixture;
  const previous = vi.mocked(gl.getParameter).getMockImplementation();
  vi.mocked(gl.getParameter).mockImplementation((parameter) => {
    if (parameter === gl.VIEWPORT || parameter === gl.SCISSOR_BOX) return [0, 0, 200, 100];
    return previous?.(parameter);
  });
  return fixture;
}

function createRenderTexture(options: { depth?: boolean; height: number; width: number }): RenderTexture {
  return {
    colorSpace: 'linear',
    depth: options.depth ?? false,
    flipX: false,
    flipY: true,
    height: options.height,
    sampler: {
      anisotropy: 1,
      magFilter: 'linear',
      minFilter: 'linear',
      mipmaps: false,
      wrapU: 'clamp-to-edge',
      wrapV: 'clamp-to-edge',
    },
    uvOffset: { x: 0, y: 0 },
    uvRotation: 0,
    uvScale: { x: 1, y: 1 },
    width: options.width,
  } as unknown as RenderTexture;
}
