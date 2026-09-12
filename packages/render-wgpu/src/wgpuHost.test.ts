import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Entity, WgpuHostAcquisition, HostWgpuProvider } from '@flighthq/types/contract';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  createWebWgpuHostBackend,
  getWgpuHostBackend,
  initializeWebWgpuHostBackend,
  installWgpuHostBackend,
  resetWgpuHostBackendForTest,
  setWgpuHostBackend,
} from './wgpuHost';
import { createEmptyWgpuRegistries, createWgpuPipeline } from './wgpuPipeline';
import {
  createWgpuAcquisition,
  createWgpuRenderState,
  destroyWgpuRenderState,
  releaseWgpuAcquisition,
} from './wgpuRenderState';
import { installWgpuMock } from './wgpuTestHelper';

function fakeBackend(): HostWgpuProvider {
  return entityBackend({
    acquire: vi.fn(),
    attachSurface: vi.fn(() => null),
    isSupported: vi.fn(() => true),
    release: vi.fn(),
  });
}

function entityBackend(fields: Omit<HostWgpuProvider, keyof Entity>): HostWgpuProvider {
  return (() => {
    const out = allocateEntity<HostWgpuProvider>();
    Object.assign(out, fields);
    return finishEntity(out);
  })();
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
    const acquisition = allocateEntity<WgpuHostAcquisition>();
    Object.assign(acquisition, acquired);
    acquisition.ownership = 'caller' as const;
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

describe('initializeWebWgpuHostBackend', () => {
  it('is the construction initializer of createWebWgpuHostBackend', () => {
    expect(typeof initializeWebWgpuHostBackend).toBe('function');
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
    const acquisition = allocateEntity<WgpuHostAcquisition>();
    Object.assign(acquisition, acquired);
    acquisition.ownership = 'caller' as const;
    const backend = entityBackend({
      acquire: vi.fn(async () => acquisition),
      attachSurface: vi.fn(() => null),
      isSupported: vi.fn(() => true),
      release: vi.fn(),
    });
    const canvas = document.createElement('canvas');
    setWgpuHostBackend(backend);

    const routed = await createWgpuAcquisition(canvas);
    expect(backend.acquire).toHaveBeenCalledWith(canvas, {});
    expect(routed?.device).toBe(acquisition.device);
    expect(routed?.format).toBe(acquisition.format);

    releaseWgpuAcquisition(acquisition);
    expect(backend.release).toHaveBeenCalledOnce();
    expect(backend.release).toHaveBeenCalledWith(acquisition);

    web.release(acquired);
  });

  // ★ A RENDER STATE OWNS NO HOST HANDLES AT ALL. It used to be built from an acquisition and had to
  // decide, on every path including a failed construction, whether to release handles the caller might
  // still be using — a decision no state is in a position to make correctly. It now takes the device
  // alone, so there is nothing to get wrong: destroying a state cannot reach a context or a device, and
  // the caller's handles outlive it by construction rather than by policy.
  it('never releases host handles when a state built on the device is destroyed', async () => {
    const web = createWebWgpuHostBackend();
    const acquired = await web.acquire(document.createElement('canvas'), {});
    const destroy = vi.spyOn(acquired.device, 'destroy');
    const unconfigure = vi.spyOn(acquired.context, 'unconfigure');
    const backend = entityBackend({
      acquire: vi.fn(async () => acquired),
      attachSurface: vi.fn(() => null),
      isSupported: vi.fn(() => true),
      release: vi.fn((held) => {
        held.context.unconfigure();
        held.device.destroy();
      }),
    });
    setWgpuHostBackend(backend);

    destroyWgpuRenderState(createWgpuRenderState(acquired.device, _pipeline));

    expect(backend.release).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
    expect(unconfigure).not.toHaveBeenCalled();
    // The handles are still usable, which is the property the caller actually cares about.
    expect(acquired.device.createBuffer({ size: 4, usage: GPUBufferUsage.COPY_DST }).size).toBe(4);

    destroy.mockRestore();
    unconfigure.mockRestore();
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
