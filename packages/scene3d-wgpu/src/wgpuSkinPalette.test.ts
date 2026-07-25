import { describe, expect, it } from 'vitest';

import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';
import {
  destroyWgpuSkinPalette,
  ensureWgpuSkinDrawBindGroup,
  ensureWgpuSkinDrawLayout,
  registerWgpuGpuSkinning,
  uploadWgpuSkinPalette,
} from './wgpuSkinPalette';

describe('destroyWgpuSkinPalette', () => {
  it('clears every palette and draw-group cache slot', () => {
    const { state } = makeWgpuScene3DState();
    uploadWgpuSkinPalette(state, new Float32Array(16));
    const runtime = getWgpuScene3DRuntime(state);
    runtime.skinDrawBindGroup = {} as GPUBindGroup;

    destroyWgpuSkinPalette(state);

    expect(runtime.skinPaletteTexture).toBeNull();
    expect(runtime.skinPaletteView).toBeNull();
    expect(runtime.skinPaletteCapacity).toBe(0);
    expect(runtime.skinDrawBindGroup).toBeNull();
  });
});

describe('ensureWgpuSkinDrawBindGroup', () => {
  it('caches the group and rebuilds it only when palette growth replaces its view', () => {
    const { fake, state } = makeWgpuScene3DState();
    const first = ensureWgpuSkinDrawBindGroup(state, new Float32Array(16));
    const groupCount = fake.calls.filter((call) => call.name === 'createBindGroup').length;
    expect(ensureWgpuSkinDrawBindGroup(state, new Float32Array(16))).toBe(first);
    expect(fake.calls.filter((call) => call.name === 'createBindGroup')).toHaveLength(groupCount);

    ensureWgpuSkinDrawBindGroup(state, new Float32Array(32));
    expect(fake.calls.filter((call) => call.name === 'createBindGroup')).toHaveLength(groupCount + 1);
    expect(fake.calls.filter((call) => call.name === 'createTexture')).toHaveLength(2);
  });
});

describe('ensureWgpuSkinDrawLayout', () => {
  it('caches the state-owned skin draw layout', () => {
    const { fake, state } = makeWgpuScene3DState();
    const layout = ensureWgpuSkinDrawLayout(state);
    expect(ensureWgpuSkinDrawLayout(state)).toBe(layout);
    expect(fake.calls.filter((call) => call.name === 'createBindGroupLayout')).toHaveLength(1);
  });
});

describe('registerWgpuGpuSkinning', () => {
  it('installs the opt-in adapter on only the requested render state', () => {
    const { state } = makeWgpuScene3DState();
    expect(getWgpuScene3DRuntime(state).skinningAdapter).toBeNull();
    registerWgpuGpuSkinning(state);
    expect(getWgpuScene3DRuntime(state).skinningAdapter).not.toBeNull();
  });
});

describe('uploadWgpuSkinPalette', () => {
  it('packs four rgba32float texels per joint into one row', () => {
    const { fake, state } = makeWgpuScene3DState();
    const joints = new Float32Array(32);
    const view = uploadWgpuSkinPalette(state, joints);
    const texture = fake.calls.find((call) => call.name === 'createTexture');
    const write = fake.calls.find((call) => call.name === 'writeTexture');

    expect(view).toBe(getWgpuScene3DRuntime(state).skinPaletteView);
    expect(texture?.args[0]).toMatchObject({
      format: 'rgba32float',
      size: [8, 1, 1],
    });
    expect(write?.args[2]).toEqual({ bytesPerRow: 128 });
    expect(write?.args[3]).toEqual([8, 1, 1]);
  });

  it('reuses capacity and grows without a joint-count fallback gate', () => {
    const { fake, state } = makeWgpuScene3DState();
    uploadWgpuSkinPalette(state, new Float32Array(16 * 80));
    uploadWgpuSkinPalette(state, new Float32Array(16 * 40));
    expect(fake.calls.filter((call) => call.name === 'createTexture')).toHaveLength(1);

    uploadWgpuSkinPalette(state, new Float32Array(16 * 160));
    expect(fake.calls.filter((call) => call.name === 'createTexture')).toHaveLength(2);
    expect(getWgpuScene3DRuntime(state).skinPaletteCapacity).toBe(160);
  });
});
