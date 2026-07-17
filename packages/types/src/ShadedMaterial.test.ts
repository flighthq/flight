import type { EmissiveModifier } from './EmissiveModifier';
import { EntityRuntimeKey } from './Entity';
import type { RimModifier } from './RimModifier';
import type { ShadedMaterial } from './ShadedMaterial';
import { ShadedMaterialKind } from './ShadedMaterial';
import type { SurfaceMaterial } from './SurfaceMaterial';

describe('ShadedMaterial', () => {
  describe('ShadedMaterialKind', () => {
    it('is the canonical PascalCase type name', () => {
      expect(ShadedMaterialKind).toBe('ShadedMaterial');
    });
  });

  describe('composable base material', () => {
    it('carries an ordered modifier stack across slots', () => {
      const emissive: EmissiveModifier = {
        kind: 'EmissiveModifier',
        slot: 'Emissive',
        color: 0xffdd88ff,
        strength: 2,
      };
      const rim: RimModifier = { kind: 'RimModifier', slot: 'Effect', color: 0x88bbffff };

      const material: ShadedMaterial = {
        [EntityRuntimeKey]: undefined,
        kind: ShadedMaterialKind,
        alphaCutoff: 0.5,
        alphaMode: 'opaque',
        alphaType: 'straight',
        blendMode: 'Normal',
        doubleSided: false,
        diffuse: 0x334455ff,
        diffuseMap: null,
        normalMap: null,
        normalScale: 1,
        shininess: 32,
        specular: 0xffffffff,
        specularMap: null,
        modifiers: [emissive, rim],
      };

      // Ordering is preserved for deterministic compilation.
      expect(material.modifiers[0]?.slot).toBe('Emissive');
      expect(material.modifiers[1]?.slot).toBe('Effect');
    });

    it('is a SurfaceMaterial (a lit surface over the shared trailer)', () => {
      const material: ShadedMaterial = {
        [EntityRuntimeKey]: undefined,
        kind: ShadedMaterialKind,
        alphaCutoff: 0,
        alphaMode: 'blend',
        alphaType: 'straight',
        blendMode: 'Normal',
        doubleSided: true,
        diffuse: 0xffffffff,
        diffuseMap: null,
        normalMap: null,
        normalScale: 1,
        shininess: 16,
        specular: 0x000000ff,
        specularMap: null,
        modifiers: [],
      };
      const surface: SurfaceMaterial = material;
      expect(surface.kind).toBe('ShadedMaterial');
    });
  });
});
