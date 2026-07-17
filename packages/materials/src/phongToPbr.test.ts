import { StandardPbrMaterialKind } from '@flighthq/types';

import { createPhongMaterial } from './classicMaterials';
import {
  convertPhongToStandardPbrMaterial,
  getPbrMetallicFromPhongSpecular,
  getPbrRoughnessFromPhongShininess,
  getPhongToPbrLightExposure,
} from './phongToPbr';

describe('convertPhongToStandardPbrMaterial', () => {
  it('maps a neutral Phong material to a plausible PBR material', () => {
    const phong = createPhongMaterial();
    const pbr = convertPhongToStandardPbrMaterial(phong);
    expect(pbr.kind).toBe(StandardPbrMaterialKind);
    // Diffuse and baseColor share the packed sRgb-albedo encoding — color transfers unchanged.
    expect(pbr.baseColor).toBe(phong.diffuse);
    expect(pbr.roughness).toBeGreaterThan(0);
    expect(pbr.roughness).toBeLessThan(1);
    // A white specular over a white diffuse is a dielectric, not a metal.
    expect(pbr.metallic).toBe(0);
  });
  it('preserves the normal map and scale', () => {
    const phong = createPhongMaterial({ normalScale: 0.5 });
    const pbr = convertPhongToStandardPbrMaterial(phong);
    expect(pbr.normalScale).toBe(0.5);
    expect(pbr.normalMap).toBe(phong.normalMap);
  });
  it('lets opts override a mapped field', () => {
    const phong = createPhongMaterial();
    const pbr = convertPhongToStandardPbrMaterial(phong, { metallic: 1, roughness: 0.2 });
    expect(pbr.metallic).toBe(1);
    expect(pbr.roughness).toBe(0.2);
  });
});

describe('getPbrMetallicFromPhongSpecular', () => {
  it('reads a bright specular over a near-black diffuse as metallic', () => {
    expect(getPbrMetallicFromPhongSpecular(0xffffffff, 0x000000ff)).toBe(1);
  });
  it('reads a white specular over a lit diffuse as dielectric', () => {
    expect(getPbrMetallicFromPhongSpecular(0xffffffff, 0xffffffff)).toBe(0);
    expect(getPbrMetallicFromPhongSpecular(0x808080ff, 0x333333ff)).toBe(0);
  });
});

describe('getPbrRoughnessFromPhongShininess', () => {
  it('maps the Phong default shininess of 32 to roughness ≈ 0.243', () => {
    expect(getPbrRoughnessFromPhongShininess(32)).toBeCloseTo(0.2425, 3);
  });
  it('is monotonic decreasing in shininess', () => {
    expect(getPbrRoughnessFromPhongShininess(2)).toBeGreaterThan(getPbrRoughnessFromPhongShininess(200));
  });
  it('clamps to [0, 1] and handles the degenerate shininess of 0', () => {
    const r = getPbrRoughnessFromPhongShininess(0);
    expect(r).toBeLessThanOrEqual(1);
    expect(r).toBeGreaterThanOrEqual(0);
  });
});

describe('getPhongToPbrLightExposure', () => {
  it('returns log2(π) — a ×π light scale that offsets the Lambert 1/π diffuse normalization', () => {
    expect(getPhongToPbrLightExposure()).toBeCloseTo(Math.log2(Math.PI), 10);
    // Applying the exposure multiplies intensity by ≈π (≈3.14) — the anti-too-dark factor.
    expect(2 ** getPhongToPbrLightExposure()).toBeCloseTo(Math.PI, 10);
  });
});
