import {
  clampStandardPbrMaterialProperties,
  isValidMaterialClearcoat,
  isValidMaterialIor,
  isValidMaterialIridescenceThickness,
  isValidMaterialWeight,
} from './materialValidation';
import { createStandardPbrMaterialProperties } from './pbrMaterials';

describe('clampStandardPbrMaterialProperties', () => {
  it('returns the out instance', () => {
    const props = createStandardPbrMaterialProperties();
    expect(clampStandardPbrMaterialProperties(props)).toBe(props);
  });
  it('clamps metallic to [0, 1]', () => {
    const props = createStandardPbrMaterialProperties({ metallic: 1.5 });
    clampStandardPbrMaterialProperties(props);
    expect(props.metallic).toBe(1);
    props.metallic = -0.5;
    clampStandardPbrMaterialProperties(props);
    expect(props.metallic).toBe(0);
  });
  it('clamps roughness to [0, 1]', () => {
    const props = createStandardPbrMaterialProperties({ roughness: 2 });
    clampStandardPbrMaterialProperties(props);
    expect(props.roughness).toBe(1);
    props.roughness = -1;
    clampStandardPbrMaterialProperties(props);
    expect(props.roughness).toBe(0);
  });
  it('clamps occlusionStrength to [0, 1]', () => {
    const props = createStandardPbrMaterialProperties({ occlusionStrength: 3 });
    clampStandardPbrMaterialProperties(props);
    expect(props.occlusionStrength).toBe(1);
    props.occlusionStrength = -1;
    clampStandardPbrMaterialProperties(props);
    expect(props.occlusionStrength).toBe(0);
  });
  it('clamps emissiveStrength to [0, ∞) — allows values above 1 for HDR emissive', () => {
    const props = createStandardPbrMaterialProperties({ emissiveStrength: -1 });
    clampStandardPbrMaterialProperties(props);
    expect(props.emissiveStrength).toBe(0);
    props.emissiveStrength = 10;
    clampStandardPbrMaterialProperties(props);
    expect(props.emissiveStrength).toBe(10);
  });
  it('clamps normalScale to [0, ∞) — allows values above 1 for exaggerated normals', () => {
    const props = createStandardPbrMaterialProperties({ normalScale: -2 });
    clampStandardPbrMaterialProperties(props);
    expect(props.normalScale).toBe(0);
    props.normalScale = 5;
    clampStandardPbrMaterialProperties(props);
    expect(props.normalScale).toBe(5);
  });
  it('leaves a valid block unchanged', () => {
    const props = createStandardPbrMaterialProperties({ metallic: 0.5, roughness: 0.3 });
    clampStandardPbrMaterialProperties(props);
    expect(props.metallic).toBe(0.5);
    expect(props.roughness).toBe(0.3);
  });
});

describe('isValidMaterialClearcoat', () => {
  it('returns true for values in [0, 1]', () => {
    expect(isValidMaterialClearcoat(0)).toBe(true);
    expect(isValidMaterialClearcoat(0.5)).toBe(true);
    expect(isValidMaterialClearcoat(1)).toBe(true);
  });
  it('returns false for values outside [0, 1]', () => {
    expect(isValidMaterialClearcoat(-0.1)).toBe(false);
    expect(isValidMaterialClearcoat(1.1)).toBe(false);
  });
  it('returns false for NaN and Infinity', () => {
    expect(isValidMaterialClearcoat(NaN)).toBe(false);
    expect(isValidMaterialClearcoat(Infinity)).toBe(false);
  });
});

describe('isValidMaterialIor', () => {
  it('returns true for valid IOR values', () => {
    expect(isValidMaterialIor(1.0)).toBe(true);
    expect(isValidMaterialIor(1.5)).toBe(true);
    expect(isValidMaterialIor(2.4)).toBe(true);
    expect(isValidMaterialIor(5.0)).toBe(true);
  });
  it('returns false for IOR below 1', () => {
    expect(isValidMaterialIor(0.9)).toBe(false);
    expect(isValidMaterialIor(0)).toBe(false);
  });
  it('returns false for IOR above 5', () => {
    expect(isValidMaterialIor(5.1)).toBe(false);
    expect(isValidMaterialIor(100)).toBe(false);
  });
  it('returns false for NaN and Infinity', () => {
    expect(isValidMaterialIor(NaN)).toBe(false);
    expect(isValidMaterialIor(Infinity)).toBe(false);
  });
});

describe('isValidMaterialIridescenceThickness', () => {
  it('returns true for non-negative finite values', () => {
    expect(isValidMaterialIridescenceThickness(0)).toBe(true);
    expect(isValidMaterialIridescenceThickness(100)).toBe(true);
    expect(isValidMaterialIridescenceThickness(400)).toBe(true);
    expect(isValidMaterialIridescenceThickness(2000)).toBe(true);
  });
  it('returns false for negative values', () => {
    expect(isValidMaterialIridescenceThickness(-1)).toBe(false);
  });
  it('returns false for NaN and Infinity', () => {
    expect(isValidMaterialIridescenceThickness(NaN)).toBe(false);
    expect(isValidMaterialIridescenceThickness(Infinity)).toBe(false);
  });
});

describe('isValidMaterialWeight', () => {
  it('returns true for values in [0, 1]', () => {
    expect(isValidMaterialWeight(0)).toBe(true);
    expect(isValidMaterialWeight(0.5)).toBe(true);
    expect(isValidMaterialWeight(1)).toBe(true);
  });
  it('returns false for values outside [0, 1]', () => {
    expect(isValidMaterialWeight(-0.001)).toBe(false);
    expect(isValidMaterialWeight(1.001)).toBe(false);
  });
  it('returns false for NaN and Infinity', () => {
    expect(isValidMaterialWeight(NaN)).toBe(false);
    expect(isValidMaterialWeight(Infinity)).toBe(false);
  });
});
