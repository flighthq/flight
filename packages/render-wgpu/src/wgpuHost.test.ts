import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { WgpuHostAcquisition } from '@flighthq/types/contract';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestHostTarget, createTestWgpuHostBackend } from './wgpuHost';
import { createEmptyWgpuRegistries, createWgpuPipeline } from './wgpuPipeline';
import {
  createWgpuAcquisition,
  createWgpuRenderState,
  destroyWgpuRenderState,
  releaseWgpuAcquisition,
} from './wgpuRenderState';
import { installWgpuMock } from './wgpuTestHelper';

beforeAll(installWgpuMock);

const _pipeline = createWgpuPipeline(createEmptyWgpuRegistries());

describe('createTestHostTarget', () => {
  it('brands an entity backed by a canvas the test host backend can resolve', () => {
    const canvas = document.createElement('canvas');
    const target = createTestHostTarget(canvas);
    expect(target.__brand).toBe('HostTarget');
  });
});

describe('createTestWgpuHostBackend', () => {
  it('acquires Flight-owned browser handles and releases each native handle', async () => {
    const backend = createTestWgpuHostBackend();
    const canvas = document.createElement('canvas');
    const target = createTestHostTarget(canvas);
    const acquisition = await backend.acquire(target, {});
    const unconfigure = vi.spyOn(acquisition.context, 'unconfigure');
    const destroy = vi.spyOn(acquisition.device, 'destroy');

    expect(acquisition.ownership).toBe('flight');
    backend.release(acquisition);
    expect(unconfigure).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('tears down whatever it is handed, leaving the ownership decision to the caller', async () => {
    const backend = createTestWgpuHostBackend();
    const canvas = document.createElement('canvas');
    const target = createTestHostTarget(canvas);
    const acquired = await backend.acquire(target, {});
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
      expect(createTestWgpuHostBackend().isSupported()).toBe(false);
    } finally {
      installWgpuMock();
    }
  });

  it('routes acquisition and release through a caller-provided backend', async () => {
    const web = createTestWgpuHostBackend();
    const canvas = document.createElement('canvas');
    const target = createTestHostTarget(canvas);
    const acquired = await web.acquire(target, {});
    const acquisition = allocateEntity<WgpuHostAcquisition>();
    Object.assign(acquisition, acquired);
    acquisition.ownership = 'caller' as const;
    const backend = (() => {
      const out = allocateEntity<typeof web>();
      out.acquire = vi.fn(async () => acquisition);
      out.attachSurface = vi.fn(() => null);
      out.isSupported = vi.fn(() => true);
      out.release = vi.fn();
      return finishEntity(out);
    })();
    const routeTarget = createTestHostTarget(document.createElement('canvas'));

    const routed = await createWgpuAcquisition(backend, routeTarget);
    expect(backend.acquire).toHaveBeenCalledWith(routeTarget, {});
    expect(routed?.device).toBe(acquisition.device);
    expect(routed?.format).toBe(acquisition.format);

    releaseWgpuAcquisition(backend, acquisition);
    expect(backend.release).toHaveBeenCalledOnce();
    expect(backend.release).toHaveBeenCalledWith(acquisition);

    web.release(acquired);
  });

  it('never releases host handles when a state built on the device is destroyed', async () => {
    const web = createTestWgpuHostBackend();
    const canvas = document.createElement('canvas');
    const target = createTestHostTarget(canvas);
    const acquired = await web.acquire(target, {});
    const destroy = vi.spyOn(acquired.device, 'destroy');
    const unconfigure = vi.spyOn(acquired.context, 'unconfigure');

    destroyWgpuRenderState(createWgpuRenderState(acquired.device, _pipeline));

    expect(destroy).not.toHaveBeenCalled();
    expect(unconfigure).not.toHaveBeenCalled();
    expect(acquired.device.createBuffer({ size: 4, usage: GPUBufferUsage.COPY_DST }).size).toBe(4);

    destroy.mockRestore();
    unconfigure.mockRestore();
    web.release(acquired);
  });
});
