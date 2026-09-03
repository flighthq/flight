import { createEntity } from '@flighthq/entity/contract';
import type { Entity, WgpuHostBackend } from '@flighthq/types/contract';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  createWebWgpuHostBackend,
  getWgpuHostBackend,
  installWgpuHostBackend,
  resetWgpuHostBackendForTest,
  setWgpuHostBackend,
} from './wgpuHost';
import { createEmptyWgpuRegistries, createWgpuPipeline } from './wgpuPipeline';
import {
  createWgpuRenderState,
  createWgpuRenderStateFromCanvasElement,
  destroyWgpuRenderState,
} from './wgpuRenderState';
import { installWgpuMock } from './wgpuTestHelper';

function fakeBackend(): WgpuHostBackend {
  return entityBackend({
    acquire: vi.fn(),
    isSupported: vi.fn(() => true),
    release: vi.fn(),
  });
}

function entityBackend(fields: Omit<WgpuHostBackend, keyof Entity>): WgpuHostBackend {
  return createEntity(fields);
}

beforeAll(installWgpuMock);
afterEach(resetWgpuHostBackendForTest);

const _pipeline = createWgpuPipeline(createEmptyWgpuRegistries());

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

  // ★ THE BACKEND NO LONGER DECIDES OWNERSHIP. It used to return early for `caller`, which meant the whole
  // contract lived in one implementation and any other backend could violate it unseen — and it also made
  // the caller's own release verb a no-op. `release` now tears down whatever it is handed; Flight simply
  // never hands it a caller-owned acquisition (see O1/O2), and `releaseWgpuAcquisition` hands it one only
  // because the caller asked.
  it('tears down whatever it is handed, leaving the ownership decision to the caller', async () => {
    const backend = createWebWgpuHostBackend();
    const acquired = await backend.acquire(document.createElement('canvas'), {});
    const acquisition = createEntity({ ...acquired, ownership: 'caller' as const });
    const unconfigure = vi.spyOn(acquisition.context, 'unconfigure');
    const destroy = vi.spyOn(acquisition.device, 'destroy');

    backend.release(acquisition);
    expect(unconfigure).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
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
    // Flight-owned: the state acquired these, so destroying it releases them. The caller-owned case is the
    // opposite assertion and lives in its own test below.
    const acquisition = createEntity({ ...acquired, ownership: 'flight' as const });
    const backend = entityBackend({
      acquire: vi.fn(async () => acquisition),
      isSupported: vi.fn(() => true),
      release: vi.fn(),
    });
    const canvas = document.createElement('canvas');
    setWgpuHostBackend(backend);

    const state = await createWgpuRenderStateFromCanvasElement(canvas, _pipeline);
    expect(backend.acquire).toHaveBeenCalledWith(canvas, { format: undefined, powerPreference: undefined });
    expect(state.context).toBe(acquisition.context);
    expect(state.device).toBe(acquisition.device);
    expect(state.format).toBe(acquisition.format);
    destroyWgpuRenderState(state);
    expect(backend.release).toHaveBeenCalledOnce();
    expect(backend.release).toHaveBeenCalledWith(acquisition);

    web.release(acquired);
  });

  it('releases flight-owned handles through the selected backend when initialization fails', async () => {
    const web = createWebWgpuHostBackend();
    const acquired = await web.acquire(document.createElement('canvas'), {});
    const acquisition = createEntity({ ...acquired, ownership: 'flight' as const });
    const configure = vi.spyOn(acquisition.context, 'configure').mockImplementationOnce(() => {
      throw new Error('configure failed');
    });
    const backend = entityBackend({
      acquire: vi.fn(async () => acquisition),
      isSupported: vi.fn(() => true),
      release: vi.fn(),
    });
    setWgpuHostBackend(backend);

    expect(() => createWgpuRenderState(acquisition, _pipeline)).toThrow('configure failed');
    expect(backend.release).toHaveBeenCalledOnce();
    expect(backend.release).toHaveBeenCalledWith(acquisition);

    configure.mockRestore();
    web.release(acquired);
  });

  // ★ O2. The previous shape of this test used a CALLER-owned acquisition and asserted release WAS called,
  // with a `vi.fn()` release that could not destroy anything — so it passed whether or not ownership was
  // honoured. Flight now refuses to release borrowed handles even while unwinding a failure, and the
  // backend here is deliberately one that would destroy them if asked.
  it('O2: never releases caller-owned handles when initialization fails, whatever the backend does', async () => {
    const web = createWebWgpuHostBackend();
    const acquired = await web.acquire(document.createElement('canvas'), {});
    const acquisition = createEntity({ ...acquired, ownership: 'caller' as const });
    const configure = vi.spyOn(acquisition.context, 'configure').mockImplementationOnce(() => {
      throw new Error('configure failed');
    });
    const destroy = vi.spyOn(acquisition.device, 'destroy');
    const unconfigure = vi.spyOn(acquisition.context, 'unconfigure');
    const backend = entityBackend({
      acquire: vi.fn(async () => acquisition),
      isSupported: vi.fn(() => true),
      release: vi.fn((held) => {
        held.context.unconfigure();
        held.device.destroy();
      }),
    });
    setWgpuHostBackend(backend);

    expect(() => createWgpuRenderState(acquisition, _pipeline)).toThrow('configure failed');
    expect(backend.release).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
    expect(unconfigure).not.toHaveBeenCalled();

    configure.mockRestore();
    destroy.mockRestore();
    unconfigure.mockRestore();
    web.release(acquired);
  });

  // ★ O1. The destroy path, against a backend whose release really destroys.
  it('O1: never releases caller-owned handles when the state is destroyed', async () => {
    const web = createWebWgpuHostBackend();
    const acquired = await web.acquire(document.createElement('canvas'), {});
    const acquisition = createEntity({ ...acquired, ownership: 'caller' as const });
    const destroy = vi.spyOn(acquisition.device, 'destroy');
    const backend = entityBackend({
      acquire: vi.fn(async () => acquisition),
      isSupported: vi.fn(() => true),
      release: vi.fn((held) => {
        held.device.destroy();
      }),
    });
    setWgpuHostBackend(backend);

    const state = createWgpuRenderState(acquisition, _pipeline);
    destroyWgpuRenderState(state);

    expect(backend.release).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
    // The handles are still usable, which is the property the caller actually cares about.
    expect(acquisition.device.createBuffer({ size: 4, usage: GPUBufferUsage.COPY_DST }).size).toBe(4);

    destroy.mockRestore();
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
