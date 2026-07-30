import type { RenderTexture } from '@flighthq/types/contract';
import { RenderTargetTextureSourceKind } from '@flighthq/types/contract';

import { renderWgpuBackground, submitWgpuRenderPass } from './wgpuBackground';
import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import {
  bindWgpuRenderTexture,
  destroyWgpuRenderTexture,
  isWgpuRenderTextureReady,
  renderIntoWgpuRenderTexture,
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
    storage: {
      dimension: '2d',
      image: null,
      target: { height: 8, kind: RenderTargetTextureSourceKind, width: 8 },
    },
    uvOffset: { x: 0, y: 0 },
    uvRotation: 0,
    uvScale: { x: 1, y: 1 },
    version: 0,
  } as RenderTexture;
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
