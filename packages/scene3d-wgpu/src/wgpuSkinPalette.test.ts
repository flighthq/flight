import { describe, expect, it } from 'vitest';

import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';
import {
  destroyWgpuSkinPalette,
  ensureWgpuSkinDrawBindGroup,
  ensureWgpuSkinDrawLayout,
  ensureWgpuSkinMeshDrawBindGroup,
  ensureWgpuSkinMeshDrawLayout,
  registerWgpuGpuSkinning,
  uploadWgpuSkinNormalPalette,
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

describe('ensureWgpuSkinMeshDrawBindGroup', () => {
  it('binds both palettes, so no binding its layout declares is left unsupplied', () => {
    const { fake, state } = makeWgpuScene3DState();
    ensureWgpuSkinMeshDrawBindGroup(state, new Float32Array(16 * 2), new Float32Array(12 * 2));
    const group = fake.calls.filter((call) => call.name === 'createBindGroup').at(-1);
    const bindings = (group!.args[0] as { entries: { binding: number }[] }).entries.map((e) => e.binding);
    expect(bindings).toEqual([0, 1, 2]);
  });
});

describe('ensureWgpuSkinMeshDrawLayout', () => {
  it('declares the normal palette at binding 2, which the shadow layout does NOT', () => {
    // ★ THE TWO LAYOUTS ARE DELIBERATELY DIFFERENT. The shadow path skins positions only, so making it
    // declare a normal palette would oblige it to SUPPLY one forever — a bind group must satisfy every
    // binding its layout declares. This asserts the split exists rather than trusting the comment.
    const { fake, state } = makeWgpuScene3DState();
    ensureWgpuSkinMeshDrawLayout(state);
    const meshLayout = fake.calls.filter((call) => call.name === 'createBindGroupLayout').at(-1);
    const meshBindings = (meshLayout!.args[0] as { entries: { binding: number }[] }).entries.map((e) => e.binding);
    expect(meshBindings).toEqual([0, 1, 2]);

    ensureWgpuSkinDrawLayout(state);
    const shadowLayout = fake.calls.filter((call) => call.name === 'createBindGroupLayout').at(-1);
    const shadowBindings = (shadowLayout!.args[0] as { entries: { binding: number }[] }).entries.map((e) => e.binding);
    expect(shadowBindings).toEqual([0, 1]);
  });

  it('caches its own layout rather than rebuilding it per draw', () => {
    // Only the CACHING half is asserted here. The fake device returns one shared stub for every
    // createBindGroupLayout call, so object identity cannot distinguish the mesh layout from the shadow
    // one — an assertion that they differ would be testing the mock, not the code. The binding-shape
    // test above is what proves the two layouts are actually different.
    const { fake, state } = makeWgpuScene3DState();
    ensureWgpuSkinMeshDrawLayout(state);
    ensureWgpuSkinMeshDrawLayout(state);
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

describe('uploadWgpuSkinNormalPalette', () => {
  it('packs THREE texels per joint, not four', () => {
    // ★ The joint count comes from /12, not /16: a 3x3 padded to vec4 columns is twelve floats. Reusing
    // the pose divisor would under-count every skeleton by a quarter and upload a truncated row —
    // wrong lighting rather than a failure. Two joints => 6 texels.
    const { fake, state } = makeWgpuScene3DState();
    const view = uploadWgpuSkinNormalPalette(state, new Float32Array(12 * 2));
    const texture = fake.calls.find((call) => call.name === 'createTexture');
    const write = fake.calls.find((call) => call.name === 'writeTexture');

    expect(view).toBe(getWgpuScene3DRuntime(state).skinNormalPaletteView);
    expect(texture?.args[0]).toMatchObject({ format: 'rgba32float', size: [6, 1, 1] });
    expect(write?.args[3]).toEqual([6, 1, 1]);
  });

  it('uses a texture distinct from the pose palette', () => {
    // Aliasing them would upload one over the other every frame.
    const { state } = makeWgpuScene3DState();
    uploadWgpuSkinPalette(state, new Float32Array(16));
    uploadWgpuSkinNormalPalette(state, new Float32Array(12));
    const runtime = getWgpuScene3DRuntime(state);
    expect(runtime.skinNormalPaletteTexture).not.toBe(runtime.skinPaletteTexture);
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
