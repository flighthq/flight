import { EntityRuntimeKey } from '@flighthq/entity/contract';
import type { WgpuDevice, WgpuRenderState } from '@flighthq/render-wgpu/contract';
import {
  beginWgpuScreenRenderPassForTest,
  submitWgpuFrame,
  createWgpuDeviceState,
  createWgpuRenderStateRuntime,
} from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import { getRenderStateRuntime } from '@flighthq/render/contract';
import { createDisplayObject, DisplayObjectKind } from '@flighthq/scene2d/contract';
import { describe, expect, it } from 'vitest';

import { wgpuScene2DRenderer, drawWgpuScene2D, renderWgpuScene2D, registerWgpuScene2DRenderer } from './wgpuNode2D.ts';

beforeAll(() => {
  installWgpuMock();
});

describe('drawWgpuScene2D', () => {
  it('is a no-op (plain display objects have no geometry)', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);
    const renderProxy = { source: createDisplayObject() } as never;
    expect(() => drawWgpuScene2D(state, renderProxy)).not.toThrow();
    submitWgpuFrame(state);
  });
});

describe('registerWgpuScene2DRenderer', () => {
  it('registers wgpuScene2DRenderer under DisplayObjectKind', () => {
    const state = createRegistrationTestState();
    registerWgpuScene2DRenderer(state);
    expect(getRenderStateRuntime(state).registries.nodeRenderers.get(DisplayObjectKind)).toBe(wgpuScene2DRenderer);
  });
});

describe('renderWgpuScene2D', () => {
  it('traverses a display object without error', async () => {
    const state = await createWgpuRenderStateForTest();
    const pass = beginWgpuScreenRenderPassForTest(state);
    const root = createDisplayObject();
    expect(() => renderWgpuScene2D(pass, root)).not.toThrow();
    submitWgpuFrame(state);
  });
});

describe('wgpuScene2DRenderer', () => {
  it('has createData and draw functions', () => {
    expect(typeof wgpuScene2DRenderer.createData).toBe('function');
    expect(typeof wgpuScene2DRenderer.submit).toBe('function');
  });
});

function createRegistrationTestState(): WgpuRenderState {
  const state = {} as WgpuRenderState;
  state[EntityRuntimeKey] = createWgpuRenderStateRuntime(createWgpuDeviceState({} as WgpuDevice));
  return state;
}
