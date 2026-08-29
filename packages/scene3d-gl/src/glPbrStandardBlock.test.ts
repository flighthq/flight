import { createStandardPbrMaterial, createStandardPbrMaterialProperties } from '@flighthq/materials/contract';
import { registerGlTextureResolver } from '@flighthq/render-gl/contract';
import type { StandardPbrMaterialProperties, Texture } from '@flighthq/types/contract';

import { compileGlPbrProgram } from './glPbrProgramCache';
import {
  bindGlPbrStandardBlock,
  bindGlPbrStandardTexture,
  buildGlPbrStandardDefineKey,
  isGlTextureReady,
} from './glPbrStandardBlock';
import { makeFakeGl2, makeGlScene3DState } from './glScene3DTestHelper';

function makeProgram() {
  const { state } = makeGlScene3DState();
  return compileGlPbrProgram(makeFakeGl2(), buildGlPbrStandardDefineKey(state, null, null));
}

// A texture that reports pixels (isGlTextureReady === true) without a real upload.
const READY_TEXTURE = {
  dimension: '2d',
  source: { kind: 'test.ready' },
} as unknown as Texture;

function makeTextureReadyState() {
  const { state } = makeGlScene3DState();
  registerGlTextureResolver(state, 'test.ready', () => ({ straightAlpha: false, texture: {} as WebGLTexture }));
  return state;
}

describe('bindGlPbrStandardBlock', () => {
  it('uploads neutral defaults for a null block', () => {
    const { state, gl } = makeGlScene3DState();
    bindGlPbrStandardBlock(state, makeProgram(), null);
    expect(gl.calls.some((c) => c.name === 'uniform4f')).toBe(true);
    expect(gl.calls.filter((c) => c.name === 'uniform1f').length).toBeGreaterThanOrEqual(4);
  });

  it('uploads the metallic-roughness scalars and emissive for a material block', () => {
    const { state, gl } = makeGlScene3DState();
    const standard = createStandardPbrMaterialProperties({ metallic: 0.5, occlusionStrength: 0.3, roughness: 0.6 });
    bindGlPbrStandardBlock(state, makeProgram(), standard);
    expect(gl.calls.some((c) => c.name === 'uniform4f')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform3f')).toBe(true);
    expect(gl.calls.filter((c) => c.name === 'uniform1f').length).toBeGreaterThanOrEqual(4);
    // No textures bound when every map is null.
    expect(gl.calls.some((c) => c.name === 'activeTexture')).toBe(false);
  });
});

describe('bindGlPbrStandardTexture', () => {
  it('is a no-op when the texture slot is empty', () => {
    const { state, gl } = makeGlScene3DState();
    bindGlPbrStandardTexture(state, null, makeProgram().locBaseColorMap, 0);
    expect(gl.calls.some((c) => c.name === 'activeTexture')).toBe(false);
  });
});

describe('buildGlPbrStandardDefineKey', () => {
  it('propagates the alpha-mask flag from the surface material', () => {
    const state = makeTextureReadyState();
    expect(
      buildGlPbrStandardDefineKey(state, null, createStandardPbrMaterial({ alphaMode: 'mask' })).alphaMaskEnabled,
    ).toBe(true);
  });

  it('samples the alpha map for mask/blend but not for an opaque material', () => {
    const state = makeTextureReadyState();
    const standard = { alphaMap: READY_TEXTURE } as unknown as StandardPbrMaterialProperties;
    expect(
      buildGlPbrStandardDefineKey(state, standard, createStandardPbrMaterial({ alphaMode: 'mask' })).hasAlphaMap,
    ).toBe(true);
    expect(
      buildGlPbrStandardDefineKey(state, standard, createStandardPbrMaterial({ alphaMode: 'blend' })).hasAlphaMap,
    ).toBe(true);
    expect(
      buildGlPbrStandardDefineKey(state, standard, createStandardPbrMaterial({ alphaMode: 'opaque' })).hasAlphaMap,
    ).toBe(false);
  });

  it('returns all-false standard map flags for a null block', () => {
    const key = buildGlPbrStandardDefineKey(makeTextureReadyState(), null, null);
    expect(key.hasAlphaMap).toBe(false);
    expect(key.hasBaseColorMap).toBe(false);
    expect(key.hasEmissiveMap).toBe(false);
    expect(key.hasMetallicRoughnessMap).toBe(false);
    expect(key.hasOcclusionMap).toBe(false);
    expect(key.hasUvTransform).toBe(false);
  });
});

describe('isGlTextureReady', () => {
  it('is false for a null texture', () => {
    expect(isGlTextureReady(makeTextureReadyState(), null)).toBe(false);
  });
});
