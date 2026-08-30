import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import type { RenderTexture } from '@flighthq/types/contract';
import { RenderTargetTextureSourceKind } from '@flighthq/types/contract';

import { enableGlRenderTextureGuards } from './enableGlRenderTextureGuards';
import { getGlRenderStateRuntime } from './glRenderState';
import {
  bindGlRenderTexture,
  clearGlRenderTexture,
  destroyGlRenderTexture,
  explainGlRenderTexture,
  getGlRenderTextureColorSpace,
  getGlRenderTextureTarget,
  invalidateGlRenderTexture,
  isGlRenderTextureReady,
  renderIntoGlRenderTexture,
  setGlRenderTextureGuard,
  writeGlRenderTextureTarget,
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
    expect(getGlRenderStateRuntime(state).context.currentTextureRealization?.texture).toBe(texture);
  });

  it('uses the null sentinel before the first render', () => {
    const { state } = createRenderTextureState();
    expect(bindGlRenderTexture(state, createRenderTexture({ height: 8, width: 8 }))).toBeNull();
    expect(getGlRenderStateRuntime(state).context.currentTextureRealization).toBeNull();
  });
});

describe('clearGlRenderTexture', () => {
  it('clears and publishes the hidden target through the RenderTexture handle', () => {
    const { state, gl } = createRenderTextureState();
    const renderTexture = createRenderTexture({ height: 8, width: 8 });

    clearGlRenderTexture(state, renderTexture);

    expect(gl.clear).toHaveBeenCalledWith(gl.COLOR_BUFFER_BIT);
    expect(isGlRenderTextureReady(state, renderTexture)).toBe(true);
    expect(renderTexture.version).toBe(1);
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

describe('explainGlRenderTexture', () => {
  it('reports source dimensions and lifecycle status', () => {
    const { state } = createRenderTextureState();
    const renderTexture = createRenderTexture({ height: 12, width: 20 });

    expect(explainGlRenderTexture(state, renderTexture)).toEqual({
      height: 12,
      status: 'unrendered',
      width: 20,
    });
  });
});

describe('getGlRenderTextureColorSpace', () => {
  it('reports the source color space before allocation and target color space after rendering', () => {
    const { state } = createRenderTextureState();
    const renderTexture = createRenderTexture({ height: 8, width: 8 });

    expect(getGlRenderTextureColorSpace(state, renderTexture)).toBe('linear');
    renderIntoGlRenderTexture(state, renderTexture, () => {});
    expect(getGlRenderTextureColorSpace(state, renderTexture)).toBe('linear');
  });
});

describe('getGlRenderTextureTarget', () => {
  it('returns the hidden target only after a completed write', () => {
    const { state } = createRenderTextureState();
    const renderTexture = createRenderTexture({ height: 8, width: 8 });

    expect(getGlRenderTextureTarget(state, renderTexture)).toBeNull();
    writeGlRenderTextureTarget(state, renderTexture, () => {});
    expect(getGlRenderTextureTarget(state, renderTexture)).not.toBeNull();
  });
});

describe('invalidateGlRenderTexture', () => {
  it('makes a previously published target unavailable without deleting it', () => {
    const { state, gl } = createRenderTextureState();
    const renderTexture = createRenderTexture({ height: 8, width: 8 });
    writeGlRenderTextureTarget(state, renderTexture, () => {});
    const deletes = vi.mocked(gl.deleteTexture).mock.calls.length;

    invalidateGlRenderTexture(state, renderTexture);

    expect(isGlRenderTextureReady(state, renderTexture)).toBe(false);
    expect(getGlRenderTextureTarget(state, renderTexture)).toBeNull();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(deletes);
  });
});

describe('isGlRenderTextureReady', () => {
  it('becomes true only after a completed render', () => {
    const { state } = createRenderTextureState();
    const renderTexture = createRenderTexture({ height: 8, width: 8 });

    expect(isGlRenderTextureReady(state, renderTexture)).toBe(false);
    renderIntoGlRenderTexture(state, renderTexture, () => {});
    expect(isGlRenderTextureReady(state, renderTexture)).toBe(true);
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
    expect(renderTexture.version).toBe(0);

    renderIntoGlRenderTexture(state, renderTexture, callback);

    expect(callback).toHaveBeenCalledOnce();
    expect(renderTexture.version).toBe(1);
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

  it('invalidates a previously-ready target when a replacement render throws', () => {
    const { state } = createRenderTextureState();
    const renderTexture = createRenderTexture({ height: 8, width: 8 });
    renderIntoGlRenderTexture(state, renderTexture, () => {});

    expect(() =>
      renderIntoGlRenderTexture(state, renderTexture, () => {
        throw new Error('replacement failed');
      }),
    ).toThrow('replacement failed');

    expect(explainGlRenderTexture(state, renderTexture).status).toBe('unrendered');
    expect(bindGlRenderTexture(state, renderTexture)).toBeNull();
  });

  it('keeps an outer writer active after a nested same-target pass is rejected', () => {
    const { state } = createRenderTextureState();
    const renderTexture = createRenderTexture({ height: 8, width: 8 });

    renderIntoGlRenderTexture(state, renderTexture, () => {
      getGlRenderStateRuntime(state).currentMaskDepth = 1;

      expect(() => renderIntoGlRenderTexture(state, renderTexture, () => {})).toThrow(
        'cannot nest the active framebuffer while a contour clip is live',
      );
      expect(explainGlRenderTexture(state, renderTexture).status).toBe('writing');
    });

    expect(explainGlRenderTexture(state, renderTexture).status).toBe('ready');
  });

  it('resizes the retained target when the source dimensions change', () => {
    const { state } = createRenderTextureState();
    const renderTexture = createRenderTexture({ height: 16, width: 32 });
    renderIntoGlRenderTexture(state, renderTexture, () => {});

    renderTexture.source.width = 12;
    renderTexture.source.height = 10;
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

describe('setGlRenderTextureGuard', () => {
  it('installs and removes a sentinel diagnostic callback', () => {
    const { state } = createRenderTextureState();
    const renderTexture = createRenderTexture({ height: 8, width: 8 });
    const guard = vi.fn();

    setGlRenderTextureGuard(state, guard);
    bindGlRenderTexture(state, renderTexture);
    expect(guard).toHaveBeenCalledOnce();

    setGlRenderTextureGuard(state, null);
    bindGlRenderTexture(state, renderTexture);
    expect(guard).toHaveBeenCalledOnce();
  });
});

describe('writeGlRenderTextureTarget', () => {
  it('passes the hidden target to the producer and publishes the completed write', () => {
    const { state } = createRenderTextureState();
    const renderTexture = createRenderTexture({ height: 10, width: 12 });
    const producer = vi.fn();

    writeGlRenderTextureTarget(state, renderTexture, producer);

    expect(producer).toHaveBeenCalledOnce();
    expect(producer.mock.calls[0][0]).toBe(getGlRenderTextureTarget(state, renderTexture));
    expect(renderTexture.version).toBe(1);
    expect(isGlRenderTextureReady(state, renderTexture)).toBe(true);
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
    flipX: false,
    flipY: true,
    resource: null,
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
    dimension: '2d',
    source: {
      colorSpace: 'linear',
      depth: options.depth ? 'depth-stencil' : 'none',
      height: options.height,
      kind: RenderTargetTextureSourceKind,
      version: 0,
      width: options.width,
    },
    version: 0,
  } as unknown as RenderTexture;
}
