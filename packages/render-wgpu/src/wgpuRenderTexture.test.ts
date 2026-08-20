import type { RenderTexture } from '@flighthq/types/contract';
import { RenderTargetTextureSourceKind } from '@flighthq/types/contract';

import { renderWgpuBackground, submitWgpuRenderPass } from './wgpuBackground';
import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import {
  bindWgpuRenderTexture,
  destroyWgpuRenderTexture,
  explainWgpuRenderTexture,
  getWgpuRenderTextureTarget,
  invalidateWgpuRenderTexture,
  isWgpuRenderTextureReady,
  renderIntoWgpuRenderTexture,
  setWgpuRenderTextureGuard,
  writeWgpuRenderTextureTarget,
} from './wgpuRenderTexture';
import { createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';

beforeAll(() => {
  installWgpuMock();
});

function texture(): RenderTexture {
  return {
    colorSpace: 'linear',
    flipX: false,
    flipY: false,
    sampler: {
      anisotropy: 1,
      magFilter: 'linear',
      minFilter: 'linear',
      mipmaps: false,
      wrapU: 'clamp-to-edge',
      wrapV: 'clamp-to-edge',
    },
    dimension: '2d',
    source: { height: 8, kind: RenderTargetTextureSourceKind, version: 0, width: 8 },
    uvOffset: { x: 0, y: 0 },
    uvRotation: 0,
    uvScale: { x: 1, y: 1 },
    version: 0,
  } as unknown as RenderTexture;
}

describe('bindWgpuRenderTexture', () => {
  it('returns null before render and the state-owned target after render', async () => {
    const state = await createWgpuRenderStateForTest();
    const renderTexture = texture();
    expect(bindWgpuRenderTexture(state, renderTexture)).toBeNull();

    renderWgpuBackground(state);
    renderIntoWgpuRenderTexture(state, renderTexture, () => {});
    expect(bindWgpuRenderTexture(state, renderTexture)).not.toBeNull();
    submitWgpuRenderPass(state);
  });
});

describe('destroyWgpuRenderTexture', () => {
  it('destroys and removes the hidden target', async () => {
    const state = await createWgpuRenderStateForTest();
    const renderTexture = texture();
    renderWgpuBackground(state);
    renderIntoWgpuRenderTexture(state, renderTexture, () => {});
    const entry = getWgpuRenderStateRuntime(state).wgpuRenderTextureCache!.get(renderTexture)!;
    const destroy = vi.spyOn(entry.target.texture, 'destroy');

    destroyWgpuRenderTexture(state, renderTexture);
    expect(destroy).toHaveBeenCalled();
    expect(bindWgpuRenderTexture(state, renderTexture)).toBeNull();
    submitWgpuRenderPass(state);
  });
});

describe('explainWgpuRenderTexture', () => {
  it('reports source dimensions and lifecycle status before allocation', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(explainWgpuRenderTexture(state, texture())).toEqual({ height: 8, status: 'unrendered', width: 8 });
  });
});

describe('getWgpuRenderTextureTarget', () => {
  it('returns the hidden target only after a completed write', async () => {
    const state = await createWgpuRenderStateForTest();
    const renderTexture = texture();

    expect(getWgpuRenderTextureTarget(state, renderTexture)).toBeNull();
    writeWgpuRenderTextureTarget(state, renderTexture, () => {});
    expect(getWgpuRenderTextureTarget(state, renderTexture)).not.toBeNull();
  });
});

describe('invalidateWgpuRenderTexture', () => {
  it('makes published content unavailable without destroying its target', async () => {
    const state = await createWgpuRenderStateForTest();
    const renderTexture = texture();
    writeWgpuRenderTextureTarget(state, renderTexture, () => {});
    const target = getWgpuRenderTextureTarget(state, renderTexture)!;
    const destroy = vi.spyOn(target.texture, 'destroy');

    invalidateWgpuRenderTexture(state, renderTexture);

    expect(getWgpuRenderTextureTarget(state, renderTexture)).toBeNull();
    expect(destroy).not.toHaveBeenCalled();
  });
});

describe('isWgpuRenderTextureReady', () => {
  it('tracks the successful rendered-content transition', async () => {
    const state = await createWgpuRenderStateForTest();
    const renderTexture = texture();
    expect(isWgpuRenderTextureReady(state, renderTexture)).toBe(false);
    renderWgpuBackground(state);
    renderIntoWgpuRenderTexture(state, renderTexture, () => {});
    expect(isWgpuRenderTextureReady(state, renderTexture)).toBe(true);
    submitWgpuRenderPass(state);
  });
});

describe('renderIntoWgpuRenderTexture', () => {
  it('restores the enclosing pass and bumps version after success', async () => {
    const state = await createWgpuRenderStateForTest();
    const renderTexture = texture();
    renderWgpuBackground(state);
    const enclosingPass = getWgpuRenderStateRuntime(state).renderPass;

    renderIntoWgpuRenderTexture(state, renderTexture, () => {});

    expect(renderTexture.version).toBe(1);
    expect(renderTexture.colorSpace).toBe('linear');
    expect(getWgpuRenderStateRuntime(state).renderPass).not.toBeNull();
    expect(getWgpuRenderStateRuntime(state).renderPass).not.toBe(enclosingPass);
    submitWgpuRenderPass(state);
  });
});

describe('setWgpuRenderTextureGuard', () => {
  it('installs and removes the lifecycle diagnostic callback', async () => {
    const state = await createWgpuRenderStateForTest();
    const renderTexture = texture();
    const guard = vi.fn();

    setWgpuRenderTextureGuard(state, guard);
    bindWgpuRenderTexture(state, renderTexture);
    expect(guard).toHaveBeenCalledOnce();

    setWgpuRenderTextureGuard(state, null);
    bindWgpuRenderTexture(state, renderTexture);
    expect(guard).toHaveBeenCalledOnce();
  });
});

describe('writeWgpuRenderTextureTarget', () => {
  it('passes the hidden target to the producer and publishes the completed write', async () => {
    const state = await createWgpuRenderStateForTest();
    const renderTexture = texture();
    const producer = vi.fn();

    writeWgpuRenderTextureTarget(state, renderTexture, producer);

    expect(producer).toHaveBeenCalledOnce();
    expect(producer.mock.calls[0][0]).toBe(getWgpuRenderTextureTarget(state, renderTexture));
    expect(renderTexture.version).toBe(1);
    expect(isWgpuRenderTextureReady(state, renderTexture)).toBe(true);
  });

  it('realizes a four-sample render texture at twice its logical extent', async () => {
    const state = await createWgpuRenderStateForTest();
    const renderTexture = texture();
    renderTexture.source.sampleCount = 4;

    writeWgpuRenderTextureTarget(state, renderTexture, () => {});

    const target = getWgpuRenderTextureTarget(state, renderTexture)!;
    expect(target.width).toBe(16);
    expect(target.height).toBe(16);
    expect(target.sampleCount).toBe(4);
  });
});
