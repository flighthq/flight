import {
  AnisotropyPbrMaterialKind,
  ClearcoatPbrMaterialKind,
  IridescencePbrMaterialKind,
  SheenPbrMaterialKind,
  SpecularPbrMaterialKind,
  SubsurfacePbrMaterialKind,
  TransmissionVolumePbrMaterialKind,
} from '@flighthq/types';

import {
  createAnisotropyPbrMaterial,
  createClearcoatPbrMaterial,
  createIridescencePbrMaterial,
  createSheenPbrMaterial,
  createSpecularPbrMaterial,
  createSubsurfacePbrMaterial,
  createTransmissionVolumePbrMaterial,
} from './pbrExtensionMaterials';
import { createStandardPbrMaterialProperties } from './pbrMaterials';

describe('createAnisotropyPbrMaterial', () => {
  it('creates an isotropic anisotropy material with a default standard block', () => {
    const material = createAnisotropyPbrMaterial();
    expect(material.kind).toBe(AnisotropyPbrMaterialKind);
    expect(material.anisotropyStrength).toBe(0);
    expect(material.anisotropyRotation).toBe(0);
    expect(material.standard.baseColor).toBe(0xffffffff);
  });

  it('composes a provided standard block', () => {
    const standard = createStandardPbrMaterialProperties({ metallic: 1 });
    expect(createAnisotropyPbrMaterial({ standard }).standard).toBe(standard);
  });
});

describe('createClearcoatPbrMaterial', () => {
  it('creates a disabled clearcoat material with a default standard block', () => {
    const material = createClearcoatPbrMaterial();
    expect(material.kind).toBe(ClearcoatPbrMaterialKind);
    expect(material.clearcoat).toBe(0);
    expect(material.clearcoatRoughness).toBe(0);
    expect(material.standard.roughness).toBe(1);
  });

  it('applies overrides', () => {
    expect(createClearcoatPbrMaterial({ clearcoat: 1 }).clearcoat).toBe(1);
  });
});

describe('createIridescencePbrMaterial', () => {
  it('creates a disabled iridescence material with glTF thickness defaults', () => {
    const material = createIridescencePbrMaterial();
    expect(material.kind).toBe(IridescencePbrMaterialKind);
    expect(material.iridescence).toBe(0);
    expect(material.iridescenceIor).toBe(1.3);
    expect(material.iridescenceThicknessMin).toBe(100);
    expect(material.iridescenceThicknessMax).toBe(400);
  });

  it('applies overrides', () => {
    expect(createIridescencePbrMaterial({ iridescence: 1 }).iridescence).toBe(1);
  });
});

describe('createSheenPbrMaterial', () => {
  it('creates a disabled sheen material with a default standard block', () => {
    const material = createSheenPbrMaterial();
    expect(material.kind).toBe(SheenPbrMaterialKind);
    expect(material.sheenColor).toBe(0x000000ff);
    expect(material.sheenRoughness).toBe(0);
    expect(material.standard.baseColor).toBe(0xffffffff);
  });

  it('applies overrides', () => {
    expect(createSheenPbrMaterial({ sheenColor: 0xffffffff }).sheenColor).toBe(0xffffffff);
  });
});

describe('createSpecularPbrMaterial', () => {
  it('creates a full-specular white-tint material with a default standard block', () => {
    const material = createSpecularPbrMaterial();
    expect(material.kind).toBe(SpecularPbrMaterialKind);
    expect(material.specular).toBe(1);
    expect(material.specularColor).toBe(0xffffffff);
    expect(material.standard.metallic).toBe(0);
  });

  it('applies overrides', () => {
    expect(createSpecularPbrMaterial({ specular: 0.5 }).specular).toBe(0.5);
  });
});

describe('createSubsurfacePbrMaterial', () => {
  it('creates a disabled subsurface material with a default standard block', () => {
    const material = createSubsurfacePbrMaterial();
    expect(material.kind).toBe(SubsurfacePbrMaterialKind);
    expect(material.subsurface).toBe(0);
    expect(material.subsurfaceColor).toBe(0xffffffff);
    expect(material.thickness).toBe(0);
    expect(material.standard.roughness).toBe(1);
  });

  it('applies overrides', () => {
    expect(createSubsurfacePbrMaterial({ subsurface: 1 }).subsurface).toBe(1);
  });
});

describe('createTransmissionVolumePbrMaterial', () => {
  it('creates an opaque transmission material with glTF ior and no absorption', () => {
    const material = createTransmissionVolumePbrMaterial();
    expect(material.kind).toBe(TransmissionVolumePbrMaterialKind);
    expect(material.transmission).toBe(0);
    expect(material.ior).toBe(1.5);
    expect(material.attenuationColor).toBe(0xffffffff);
    expect(material.attenuationDistance).toBe(Infinity);
    expect(material.standard.baseColor).toBe(0xffffffff);
  });

  it('applies overrides', () => {
    expect(createTransmissionVolumePbrMaterial({ transmission: 1 }).transmission).toBe(1);
  });
});
