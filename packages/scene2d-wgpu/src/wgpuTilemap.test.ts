import { EntityRuntimeKey } from '@flighthq/entity/contract';
import type { WgpuDevice, WgpuRenderState } from '@flighthq/render-wgpu/contract';
import {
  beginWgpuScreenRenderPassForTest,
  submitWgpuFrame,
  createWgpuDeviceState,
  createWgpuRenderStateRuntime,
} from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import { getRenderProxy2D, prepareScene2DRender, getRenderStateRuntime } from '@flighthq/render/contract';
import { createTilemap, TilemapKind } from '@flighthq/tilemap/contract';
import { describe, expect, it } from 'vitest';

import { flushWgpuQuadBatchWriter } from './wgpuQuadBatchWriter.ts';
import { wgpuTilemapRenderer, registerWgpuTilemapRenderer } from './wgpuTilemap.ts';

beforeAll(() => {
  installWgpuMock();
});

describe('registerWgpuTilemapRenderer', () => {
  it('registers wgpuTilemapRenderer under TilemapKind', () => {
    const state = createRegistrationTestState();
    registerWgpuTilemapRenderer(state);
    expect(getRenderStateRuntime(state).registries.nodeRenderers.get(TilemapKind)).toBe(wgpuTilemapRenderer);
  });
});

describe('wgpuTilemapRenderer', () => {
  it('has a createData function', () => {
    expect(typeof wgpuTilemapRenderer.createData).toBe('function');
  });

  it('has a submit function', () => {
    expect(typeof wgpuTilemapRenderer.submit).toBe('function');
  });
});

describe('wgpuTilemapRenderer.submit', () => {
  it('does not throw when atlas is null', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);

    const tilemap = createTilemap();
    prepareScene2DRender(state, tilemap);
    const renderProxy = getRenderProxy2D(state, tilemap)!;

    expect(() => {
      wgpuTilemapRenderer.submit(state, renderProxy);
      flushWgpuQuadBatchWriter(state as any);
    }).not.toThrow();
    submitWgpuFrame(state);
  });

  it('does not throw when renderPass is null', async () => {
    const state = await createWgpuRenderStateForTest();
    const tilemap = createTilemap();
    prepareScene2DRender(state, tilemap);
    const renderProxy = getRenderProxy2D(state, tilemap)!;

    expect(() => wgpuTilemapRenderer.submit(state, renderProxy)).not.toThrow();
  });
});

function createRegistrationTestState(): WgpuRenderState {
  const state = {} as WgpuRenderState;
  state[EntityRuntimeKey] = createWgpuRenderStateRuntime(createWgpuDeviceState({} as WgpuDevice));
  return state;
}
