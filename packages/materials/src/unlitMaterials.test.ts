import {
  DepthMaterialKind,
  EmissiveMaterialKind,
  MatcapMaterialKind,
  NormalMaterialKind,
  ToonMaterialKind,
  UnlitMaterialKind,
  VertexColorMaterialKind,
  WireframeMaterialKind,
} from '@flighthq/types';

import {
  createDepthMaterial,
  createEmissiveMaterial,
  createMatcapMaterial,
  createNormalMaterial,
  createToonMaterial,
  createUnlitMaterial,
  createVertexColorMaterial,
  createWireframeMaterial,
} from './unlitMaterials';

describe('createDepthMaterial', () => {
  it('creates a depth material with a unit range', () => {
    const material = createDepthMaterial();
    expect(material.kind).toBe(DepthMaterialKind);
    expect(material.near).toBe(0);
    expect(material.far).toBe(1);
  });

  it('applies overrides', () => {
    expect(createDepthMaterial({ far: 100, near: 0.1 }).far).toBe(100);
  });
});

describe('createEmissiveMaterial', () => {
  it('creates a white emissive material at unit strength', () => {
    const material = createEmissiveMaterial();
    expect(material.kind).toBe(EmissiveMaterialKind);
    expect(material.emissive).toBe(0xffffffff);
    expect(material.emissiveMap).toBeNull();
    expect(material.emissiveStrength).toBe(1);
  });

  it('applies overrides', () => {
    expect(createEmissiveMaterial({ emissiveStrength: 4 }).emissiveStrength).toBe(4);
  });
});

describe('createMatcapMaterial', () => {
  it('creates a matcap material with a white tint and no capture', () => {
    const material = createMatcapMaterial();
    expect(material.kind).toBe(MatcapMaterialKind);
    expect(material.matcap).toBeNull();
    expect(material.tint).toBe(0xffffffff);
  });

  it('applies overrides', () => {
    expect(createMatcapMaterial({ tint: 0xff0000ff }).tint).toBe(0xff0000ff);
  });
});

describe('createNormalMaterial', () => {
  it('creates a normal material at unit scale with no map', () => {
    const material = createNormalMaterial();
    expect(material.kind).toBe(NormalMaterialKind);
    expect(material.normalMap).toBeNull();
    expect(material.normalScale).toBe(1);
  });

  it('applies overrides', () => {
    expect(createNormalMaterial({ normalScale: 0.5 }).normalScale).toBe(0.5);
  });
});

describe('createToonMaterial', () => {
  it('creates a white toon material with three bands', () => {
    const material = createToonMaterial();
    expect(material.kind).toBe(ToonMaterialKind);
    expect(material.baseColor).toBe(0xffffffff);
    expect(material.baseColorMap).toBeNull();
    expect(material.ramp).toBeNull();
    expect(material.steps).toBe(3);
  });

  it('applies overrides', () => {
    expect(createToonMaterial({ steps: 5 }).steps).toBe(5);
  });
});

describe('createUnlitMaterial', () => {
  it('creates a white unlit material with no map', () => {
    const material = createUnlitMaterial();
    expect(material.kind).toBe(UnlitMaterialKind);
    expect(material.baseColor).toBe(0xffffffff);
    expect(material.baseColorMap).toBeNull();
  });

  it('applies overrides', () => {
    expect(createUnlitMaterial({ baseColor: 0x00ff00ff }).baseColor).toBe(0x00ff00ff);
  });
});

describe('createVertexColorMaterial', () => {
  it('creates a vertex-color material with a white tint', () => {
    const material = createVertexColorMaterial();
    expect(material.kind).toBe(VertexColorMaterialKind);
    expect(material.tint).toBe(0xffffffff);
  });

  it('applies overrides', () => {
    expect(createVertexColorMaterial({ tint: 0x808080ff }).tint).toBe(0x808080ff);
  });
});

describe('createWireframeMaterial', () => {
  it('creates a white wireframe material one pixel thick', () => {
    const material = createWireframeMaterial();
    expect(material.kind).toBe(WireframeMaterialKind);
    expect(material.color).toBe(0xffffffff);
    expect(material.thickness).toBe(1);
  });

  it('applies overrides', () => {
    expect(createWireframeMaterial({ thickness: 2 }).thickness).toBe(2);
  });
});
