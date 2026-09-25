import type { EmissiveModifier } from './EmissiveModifier.ts';
import { EntityRuntimeKey } from './Entity.ts';
import type { Material3D } from './Material3D.ts';
import type { RimModifier } from './RimModifier.ts';
import type { ShadedMaterial } from './ShadedMaterial.ts';
import { ShadedMaterialKind } from './ShadedMaterial.ts';

describe('ShadedMaterial', () => {
  describe('ShadedMaterialKind', () => {
    it('is the canonical PascalCase type name', () => {
      expect(ShadedMaterialKind).toBe('ShadedMaterial');
    });
  });

  describe('composable base material', () => {
    it('carries an ordered modifier stack across slots', () => {
      const emissive: EmissiveModifier = {
        [EntityRuntimeKey]: undefined,
        kind: 'EmissiveModifier',
        slot: 'Emissive',
        color: 0xffdd88ff,
        strength: 2,
      };
      const rim: RimModifier = {
        [EntityRuntimeKey]: undefined,
        kind: 'RimModifier',
        slot: 'Effect',
        color: 0x88bbffff,
      };

      const material: ShadedMaterial = {
        [EntityRuntimeKey]: undefined,
        kind: ShadedMaterialKind,
        alphaCutoff: 0.5,
        alphaMode: 'opaque',
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

    it('is a Material3D (a lit surface over the shared trailer)', () => {
      const material: ShadedMaterial = {
        [EntityRuntimeKey]: undefined,
        kind: ShadedMaterialKind,
        alphaCutoff: 0,
        alphaMode: 'blend',
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
      const surface: Material3D = material;
      expect(surface.kind).toBe('ShadedMaterial');
    });
  });
});
