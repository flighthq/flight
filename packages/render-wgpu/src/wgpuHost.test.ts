import type { WgpuHostBackend } from '@flighthq/types/contract';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  createWebWgpuHostBackend,
  getWgpuHostBackend,
  installWgpuHostBackend,
  resetWgpuHostBackendForTest,
  setWgpuHostBackend,
} from './wgpuHost';
import { createWgpuRenderState, destroyWgpuRenderState } from './wgpuRenderState';
import { installWgpuMock } from './wgpuTestHelper';

function fakeBackend(): WgpuHostBackend {
  return {
    acquire: vi.fn(),
    isSupported: vi.fn(() => true),
    release: vi.fn(),
  } as WgpuHostBackend;
}

beforeAll(installWgpuMock);
afterEach(resetWgpuHostBackendForTest);

describe('createWebWgpuHostBackend', () => {
  it('acquires Flight-owned browser handles and releases each native handle', async () => {
    const backend = createWebWgpuHostBackend();
    const canvas = document.createElement('canvas');
    const acquisition = await backend.acquire(canvas, {});
    const unconfigure = vi.spyOn(acquisition.context, 'unconfigure');
    const destroy = vi.spyOn(acquisition.device, 'destroy');

    expect(acquisition.ownership).toBe('flight');
    backend.release(acquisition);
    expect(unconfigure).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('does not destroy caller-owned handles during release', async () => {
    const backend = createWebWgpuHostBackend();
    const acquired = await backend.acquire(document.createElement('canvas'), {});
    const acquisition = { ...acquired, ownership: 'caller' } as const;
    const unconfigure = vi.spyOn(acquisition.context, 'unconfigure');
    const destroy = vi.spyOn(acquisition.device, 'destroy');

    backend.release(acquisition);
    expect(unconfigure).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });

  it('reports unsupported instead of propagating a throwing navigator.gpu getter', () => {
    Object.defineProperty(globalThis.navigator, 'gpu', {
      configurable: true,
      get(): never {
        throw new Error('host getter failed');
      },
    });
    try {
      expect(createWebWgpuHostBackend().isSupported()).toBe(false);
    } finally {
      installWgpuMock();
    }
  });
});

describe('getWgpuHostBackend', () => {
  it('returns one stable explicit web fallback', () => {
    const first = getWgpuHostBackend();
    const second = getWgpuHostBackend();
    expect(first).toBe(second);
  });
});

describe('installWgpuHostBackend', () => {
  it('preserves the first installed host identity', () => {
    const first = fakeBackend();
    installWgpuHostBackend(first);
    installWgpuHostBackend(fakeBackend());
    expect(getWgpuHostBackend()).toBe(first);
  });
});

describe('resetWgpuHostBackendForTest', () => {
  it('clears custom and host slots back to the web fallback', () => {
    const fallback = getWgpuHostBackend();
    const host = fakeBackend();
    const custom = fakeBackend();
    installWgpuHostBackend(host);
    setWgpuHostBackend(custom);

    resetWgpuHostBackendForTest();
    expect(getWgpuHostBackend()).toBe(fallback);
  });
});

describe('setWgpuHostBackend', () => {
  it('routes acquisition and release through the same selected backend', async () => {
    const web = createWebWgpuHostBackend();
    const acquired = await web.acquire(document.createElement('canvas'), {});
    const acquisition = { ...acquired, ownership: 'caller' } as const;
    const backend: WgpuHostBackend = {
      acquire: vi.fn(async () => acquisition),
      isSupported: vi.fn(() => true),
      release: vi.fn(),
    };
    const canvas = document.createElement('canvas');
    setWgpuHostBackend(backend);

    const state = await createWgpuRenderState(canvas);
    expect(backend.acquire).toHaveBeenCalledWith(canvas, { format: undefined, powerPreference: undefined });
    expect(state.context).toBe(acquisition.context);
    expect(state.device).toBe(acquisition.device);
    expect(state.format).toBe(acquisition.format);
    destroyWgpuRenderState(state);
    expect(backend.release).toHaveBeenCalledOnce();
    expect(backend.release).toHaveBeenCalledWith(acquisition);

    web.release(acquired);
  });

  it('releases through the selected backend when render-state initialization fails', async () => {
    const web = createWebWgpuHostBackend();
    const acquired = await web.acquire(document.createElement('canvas'), {});
    const acquisition = { ...acquired, ownership: 'caller' } as const;
    const configure = vi.spyOn(acquisition.context, 'configure').mockImplementationOnce(() => {
      throw new Error('configure failed');
    });
    const backend: WgpuHostBackend = {
      acquire: vi.fn(async () => acquisition),
      isSupported: vi.fn(() => true),
      release: vi.fn(),
    };
    setWgpuHostBackend(backend);

    await expect(createWgpuRenderState(document.createElement('canvas'))).rejects.toThrow('configure failed');
    expect(backend.release).toHaveBeenCalledOnce();
    expect(backend.release).toHaveBeenCalledWith(acquisition);

    configure.mockRestore();
    web.release(acquired);
  });

  it('takes precedence over host installation and reveals that host when cleared', () => {
    const host = fakeBackend();
    const custom = fakeBackend();
    installWgpuHostBackend(host);
    setWgpuHostBackend(custom);
    expect(getWgpuHostBackend()).toBe(custom);
    setWgpuHostBackend(null);
    expect(getWgpuHostBackend()).toBe(host);
  });
});
