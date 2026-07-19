import type { Modifier } from './Modifier';
import { VertexDisplaceModifierKind, VertexDisplaceModifierSource } from './VertexDisplaceModifier';
import type { VertexDisplaceModifier } from './VertexDisplaceModifier';

describe('VertexDisplaceModifier', () => {
  describe('VertexDisplaceModifierKind', () => {
    it('is the canonical PascalCase type name', () => {
      expect(VertexDisplaceModifierKind).toBe('VertexDisplaceModifier');
    });
  });

  describe('VertexDisplaceModifierSource', () => {
    it('names the displacement sources as canonical PascalCase values', () => {
      expect(VertexDisplaceModifierSource.Sine).toBe('Sine');
      expect(VertexDisplaceModifierSource.HeightMap).toBe('HeightMap');
    });
  });

  describe('descriptor shape', () => {
    it('is assignable to the open Modifier base with the vertex-stage slot', () => {
      const flag: VertexDisplaceModifier = {
        kind: 'VertexDisplaceModifier',
        slot: 'Vertex',
        source: VertexDisplaceModifierSource.Sine,
        amplitude: 0.2,
        frequency: 4,
        speed: 2,
        direction: { x: 1, y: 0, z: 0 },
      };
      const base: Modifier = flag;
      expect(base.slot).toBe('Vertex');
      expect(flag.amplitude).toBe(0.2);
    });
  });
});
