import { createBitmapText, updateBitmapText, BitmapTextKind } from '@flighthq/bitmaptext/contract';
import { EntityRuntimeKey } from '@flighthq/entity/contract';
import type { WgpuDevice, WgpuRenderState } from '@flighthq/render-wgpu/contract';
import {
  beginWgpuScreenRenderPassForTest,
  submitWgpuFrame,
  createWgpuDeviceState,
  createWgpuRenderStateRuntime,
} from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import {
  getRenderProxy2D,
  prepareScene2DRender,
  getRenderStateRuntime,
  registerNodeRenderer,
} from '@flighthq/render/contract';
import { describe, expect, it } from 'vitest';

import { wgpuBitmapTextRenderer } from './wgpuBitmapText.ts';
import { flushWgpuQuadBatchWriter } from './wgpuQuadBatchWriter.ts';

beforeAll(() => {
  installWgpuMock();
});

describe('wgpuBitmapTextRenderer', () => {
  it('registers wgpuBitmapTextRenderer under BitmapTextKind', () => {
    const state = createRegistrationTestState();
    registerNodeRenderer(state, BitmapTextKind, wgpuBitmapTextRenderer);
    expect(getRenderStateRuntime(state).registries.nodeRenderers.get(BitmapTextKind)).toBe(wgpuBitmapTextRenderer);
  });

  it('has createData and submit functions', () => {
    expect(typeof wgpuBitmapTextRenderer.createData).toBe('function');
    expect(typeof wgpuBitmapTextRenderer.submit).toBe('function');
  });
});

describe('wgpuBitmapTextRenderer.submit', () => {
  it('does not throw for a text node with no bound glyph pages', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);

    const text = createBitmapText(null, { text: 'AB' });
    updateBitmapText(text);
    prepareScene2DRender(state, text);
    const renderProxy = getRenderProxy2D(state, text)!;

    expect(() => {
      wgpuBitmapTextRenderer.submit(state, renderProxy);
      flushWgpuQuadBatchWriter(state as never);
    }).not.toThrow();
    submitWgpuFrame(state);
  });
});

function createRegistrationTestState(): WgpuRenderState {
  const state = {} as WgpuRenderState;
  state[EntityRuntimeKey] = createWgpuRenderStateRuntime(createWgpuDeviceState({} as WgpuDevice));
  return state;
}
