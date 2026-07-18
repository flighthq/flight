import { createStandardPbrMaterialProperties } from '@flighthq/materials';

import { compileGlPbrProgram } from './glPbrProgramCache';
import {
  bindGlPbrStandardBlock,
  bindGlPbrStandardTexture,
  buildGlPbrStandardDefineKey,
  isGlTextureReady,
} from './glPbrStandardBlock';
import { makeFakeGl2, makeGlSceneState } from './glSceneTestHelper';

function makeProgram() {
  return compileGlPbrProgram(makeFakeGl2(), buildGlPbrStandardDefineKey(null, false));
}

describe('bindGlPbrStandardBlock', () => {
  it('uploads neutral defaults for a null block', () => {
    const { state, gl } = makeGlSceneState();
    bindGlPbrStandardBlock(state, makeProgram(), null);
    expect(gl.calls.some((c) => c.name === 'uniform4f')).toBe(true);
    expect(gl.calls.filter((c) => c.name === 'uniform1f').length).toBeGreaterThanOrEqual(4);
  });

  it('uploads the metallic-roughness scalars and emissive for a material block', () => {
    const { state, gl } = makeGlSceneState();
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
    const { state, gl } = makeGlSceneState();
    bindGlPbrStandardTexture(state, null, makeProgram().locBaseColorMap, 0);
    expect(gl.calls.some((c) => c.name === 'activeTexture')).toBe(false);
  });
});

describe('buildGlPbrStandardDefineKey', () => {
  it('propagates the alpha-mask flag', () => {
    expect(buildGlPbrStandardDefineKey(null, true).alphaMaskEnabled).toBe(true);
  });

  it('returns all-false map and extension flags for a null block', () => {
    const key = buildGlPbrStandardDefineKey(null, false);
    expect(key.clearcoatEnabled).toBe(false);
    expect(key.hasBaseColorMap).toBe(false);
    expect(key.hasEmissiveMap).toBe(false);
    expect(key.hasMetallicRoughnessMap).toBe(false);
    expect(key.hasOcclusionMap).toBe(false);
    expect(key.hasUvTransform).toBe(false);
    expect(key.transmissionEnabled).toBe(false);
  });
});

describe('isGlTextureReady', () => {
  it('is false for a null texture', () => {
    expect(isGlTextureReady(null)).toBe(false);
  });
});
