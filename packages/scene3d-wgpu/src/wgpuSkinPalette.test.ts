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
    expect(runtime.skinPaletteArenaRows).toBe(0);
    expect(runtime.skinPaletteArenaCursor).toBe(0);
    expect(runtime.skinPaletteArenaBases).toBeNull();
    expect(runtime.skinDrawBindGroup).toBeNull();
  });
});

describe('ensureWgpuSkinDrawBindGroup', () => {
  it('caches the group and rebuilds it only when palette growth replaces its view', () => {
    const { fake, state } = makeWgpuScene3DState();
    const palette = new Float32Array(16);
    const first = ensureWgpuSkinDrawBindGroup(state, palette);
    const groupCount = fake.calls.filter((call) => call.name === 'createBindGroup').length;
    // The same skeleton keeps its region, so nothing is reallocated and nothing is rebuilt.
    expect(ensureWgpuSkinDrawBindGroup(state, palette)).toBe(first);
    expect(fake.calls.filter((call) => call.name === 'createBindGroup')).toHaveLength(groupCount);

    // A second skeleton claims the next row, which outgrows the arena and replaces its view.
    ensureWgpuSkinDrawBindGroup(state, new Float32Array(16));
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
    const base = uploadWgpuSkinNormalPalette(state, new Float32Array(12 * 2));
    const texture = fake.calls.find((call) => call.name === 'createTexture');
    const write = fake.calls.find((call) => call.name === 'writeTexture');

    expect(base).toBe(0);
    expect(texture?.args[0]).toMatchObject({ format: 'rgba32float', size: [256, 1, 1] });
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
  it('packs four rgba32float texels per joint into a fixed-width arena row', () => {
    const { fake, state } = makeWgpuScene3DState();
    const base = uploadWgpuSkinPalette(state, new Float32Array(32));
    const texture = fake.calls.find((call) => call.name === 'createTexture');
    const write = fake.calls.find((call) => call.name === 'writeTexture');

    expect(base).toBe(0);
    expect(texture?.args[0]).toMatchObject({ format: 'rgba32float', size: [256, 1, 1] });
    expect(write?.args[2]).toEqual({ bytesPerRow: 128, offset: 0 });
    expect(write?.args[3]).toEqual([8, 1, 1]);
  });

  it('gives two skeletons in one frame DISTINCT regions', () => {
    const { state } = makeWgpuScene3DState();
    const first = uploadWgpuSkinPalette(state, new Float32Array(16 * 2));
    const second = uploadWgpuSkinPalette(state, new Float32Array(16 * 2));

    // The whole point of the arena: a second skeleton must not land on the first one's texels, or every
    // skinned draw in the frame samples whichever palette was written last.
    expect(second).not.toBe(first);
    expect(second).toBe(256);
  });

  it('gives one skeleton ONE region however many passes ask for it', () => {
    const { fake, state } = makeWgpuScene3DState();
    const palette = new Float32Array(16 * 2);
    const shadowPass = uploadWgpuSkinPalette(state, palette);
    const writes = fake.calls.filter((call) => call.name === 'writeTexture').length;
    const meshPass = uploadWgpuSkinPalette(state, palette);

    expect(meshPass).toBe(shadowPass);
    expect(fake.calls.filter((call) => call.name === 'writeTexture')).toHaveLength(writes);
  });

  it('spans rows for a skeleton wider than one row, as whole rows plus the remainder', () => {
    const { fake, state } = makeWgpuScene3DState();
    // 100 joints is 400 texels against a 256-texel row: one full row and 144 left over. Two rectangles,
    // because a region straddling a row boundary is not expressible as a single copy.
    uploadWgpuSkinPalette(state, new Float32Array(16 * 100));
    const writes = fake.calls.filter((call) => call.name === 'writeTexture');

    expect(writes).toHaveLength(2);
    expect(writes[0].args[2]).toEqual({ bytesPerRow: 4096, rowsPerImage: 1 });
    expect(writes[0].args[3]).toEqual([256, 1, 1]);
    expect(writes[1].args[0]).toMatchObject({ origin: [0, 1, 0] });
    expect(writes[1].args[2]).toEqual({ bytesPerRow: 2304, offset: 4096 });
    expect(writes[1].args[3]).toEqual([144, 1, 1]);
  });

  it('starts the next region on a row boundary, so every write stays a rectangle', () => {
    const { state } = makeWgpuScene3DState();
    uploadWgpuSkinPalette(state, new Float32Array(16 * 100));
    // 400 texels rounds up to two whole rows, so the next skeleton starts at 512 rather than 400.
    expect(uploadWgpuSkinPalette(state, new Float32Array(16 * 2))).toBe(512);
  });

  it('replays regions already handed out when growth replaces the arena texture', () => {
    const { fake, state } = makeWgpuScene3DState();
    uploadWgpuSkinPalette(state, new Float32Array(16 * 2));
    const before = fake.calls.filter((call) => call.name === 'writeTexture').length;

    // Growth is a NEW texture; without the replay the first skeleton's texels would be blank in it.
    uploadWgpuSkinPalette(state, new Float32Array(16 * 2));
    expect(fake.calls.filter((call) => call.name === 'createTexture')).toHaveLength(2);
    const writes = fake.calls.filter((call) => call.name === 'writeTexture');
    expect(writes.length).toBe(before + 2);
    expect(writes.at(-2)?.args[0]).toMatchObject({ origin: [0, 0, 0] });
    expect(writes.at(-1)?.args[0]).toMatchObject({ origin: [0, 1, 0] });
  });
});
