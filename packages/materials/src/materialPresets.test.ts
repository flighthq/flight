import {
  ExtendedPbrMaterialKind,
  StandardPbrMaterialKind,
  TransmissionVolumePbrExtensionKind,
} from '@flighthq/types/contract';

import {
  createAluminumStandardPbrMaterial,
  createCarbonStandardPbrMaterial,
  createGlassExtendedPbrMaterial,
  createGoldStandardPbrMaterial,
  createIronStandardPbrMaterial,
  createMarbleStandardPbrMaterial,
  createPlasticStandardPbrMaterial,
  createRubberStandardPbrMaterial,
  createSilverStandardPbrMaterial,
  createSkinStandardPbrMaterial,
  createWoodStandardPbrMaterial,
} from './materialPresets';

describe('createAluminumStandardPbrMaterial', () => {
  it('creates a fully metallic, moderately rough material', () => {
    const m = createAluminumStandardPbrMaterial();
    expect(m.kind).toBe(StandardPbrMaterialKind);
    expect(m.metallic).toBe(1);
    expect(m.roughness).toBeCloseTo(0.35);
  });
  it('applies overrides', () => {
    const m = createAluminumStandardPbrMaterial({ roughness: 0.6 });
    expect(m.roughness).toBe(0.6);
  });
});

describe('createCarbonStandardPbrMaterial', () => {
  it('creates a dielectric, very rough dark material', () => {
    const m = createCarbonStandardPbrMaterial();
    expect(m.kind).toBe(StandardPbrMaterialKind);
    expect(m.metallic).toBe(0);
    expect(m.roughness).toBeCloseTo(0.95);
  });
});

describe('createGlassExtendedPbrMaterial', () => {
  it('composes clear glass without nesting a standard material entity', () => {
    const material = createGlassExtendedPbrMaterial();
    const extension = material.extensions[0];
    expect(material.kind).toBe(ExtendedPbrMaterialKind);
    expect(material.standard.baseColor).toBe(0xffffffff);
    expect(material.standard.metallic).toBe(0);
    expect(material.standard.roughness).toBe(0);
    expect('kind' in material.standard).toBe(false);
    expect(extension?.kind).toBe(TransmissionVolumePbrExtensionKind);
  });

  it('applies surface, standard, and transmission-volume overrides independently', () => {
    const material = createGlassExtendedPbrMaterial({
      alphaMode: 'blend',
      standard: { roughness: 0.2 },
      transmissionVolume: { ior: 1.7 },
    });
    const extension = material.extensions[0];
    expect(material.alphaMode).toBe('blend');
    expect(material.standard.roughness).toBe(0.2);
    expect(extension).toMatchObject({ ior: 1.7, transmission: 1 });
  });
});

describe('createGoldStandardPbrMaterial', () => {
  it('creates a fully metallic material with gold base color', () => {
    const m = createGoldStandardPbrMaterial();
    expect(m.kind).toBe(StandardPbrMaterialKind);
    expect(m.metallic).toBe(1);
    expect(m.baseColor).toBe(0xffd700ff);
    expect(m.roughness).toBeCloseTo(0.25);
  });
});

describe('createIronStandardPbrMaterial', () => {
  it('creates a fully metallic, moderately rough dark material', () => {
    const m = createIronStandardPbrMaterial();
    expect(m.kind).toBe(StandardPbrMaterialKind);
    expect(m.metallic).toBe(1);
    expect(m.roughness).toBeCloseTo(0.7);
  });
});

describe('createMarbleStandardPbrMaterial', () => {
  it('creates a very smooth dielectric material', () => {
    const m = createMarbleStandardPbrMaterial();
    expect(m.kind).toBe(StandardPbrMaterialKind);
    expect(m.metallic).toBe(0);
    expect(m.roughness).toBeCloseTo(0.05);
  });
});

describe('createPlasticStandardPbrMaterial', () => {
  it('creates a glossy dielectric material with white base color', () => {
    const m = createPlasticStandardPbrMaterial();
    expect(m.kind).toBe(StandardPbrMaterialKind);
    expect(m.metallic).toBe(0);
    expect(m.roughness).toBeCloseTo(0.05);
    expect(m.baseColor).toBe(0xffffffff);
  });
});

describe('createRubberStandardPbrMaterial', () => {
  it('creates a very rough dielectric material', () => {
    const m = createRubberStandardPbrMaterial();
    expect(m.kind).toBe(StandardPbrMaterialKind);
    expect(m.metallic).toBe(0);
    expect(m.roughness).toBeCloseTo(0.9);
  });
});

describe('createSilverStandardPbrMaterial', () => {
  it('creates a highly polished metallic material', () => {
    const m = createSilverStandardPbrMaterial();
    expect(m.kind).toBe(StandardPbrMaterialKind);
    expect(m.metallic).toBe(1);
    expect(m.roughness).toBeCloseTo(0.1);
    expect(m.baseColor).toBe(0xc0c0c0ff);
  });
});

describe('createSkinStandardPbrMaterial', () => {
  it('creates a warm-toned dielectric material with moderate roughness', () => {
    const m = createSkinStandardPbrMaterial();
    expect(m.kind).toBe(StandardPbrMaterialKind);
    expect(m.metallic).toBe(0);
    expect(m.roughness).toBeCloseTo(0.4);
  });
});

describe('createWoodStandardPbrMaterial', () => {
  it('creates a rough dielectric wood material', () => {
    const m = createWoodStandardPbrMaterial();
    expect(m.kind).toBe(StandardPbrMaterialKind);
    expect(m.metallic).toBe(0);
    expect(m.roughness).toBeCloseTo(0.8);
  });
});
