import type { Entity } from './Entity';
import { EntityRuntimeKey } from './Entity';
import type { Material, MaterialData, MaterialLike } from './Material';
import { DefaultMaterialKind } from './Material';

describe('Material', () => {
  describe('Material base contract', () => {
    it('accepts a foreign custom material kind', () => {
      interface AcmeMaterial extends Material {
        readonly kind: 'acme.Shimmer';
        intensity: number;
      }

      const acmeMaterial: AcmeMaterial = {
        [EntityRuntimeKey]: undefined,
        kind: 'acme.Shimmer',
        intensity: 0.5,
      };
      // A custom material is assignable to the open base
      const base: Material = acmeMaterial;
      expect(base.kind).toBe('acme.Shimmer');
    });

    it('narrows on kind discriminant', () => {
      interface RedMaterial extends Material {
        readonly kind: 'Red';
        hue: number;
      }
      interface BlueMaterial extends Material {
        readonly kind: 'Blue';
        shade: string;
      }

      function handle(mat: RedMaterial | BlueMaterial) {
        if (mat.kind === 'Red') {
          expectTypeOf(mat).toHaveProperty('hue');
        } else {
          expectTypeOf(mat).toHaveProperty('shade');
        }
      }

      const red: RedMaterial = { [EntityRuntimeKey]: undefined, kind: 'Red', hue: 0 };
      handle(red);
      expect(red.kind).toBe('Red');
    });
  });

  describe('MaterialLike', () => {
    it('strips the EntityRuntimeKey from Material', () => {
      const like: MaterialLike = { kind: 'SomeMaterial' };
      expect(like.kind).toBe('SomeMaterial');
    });

    it('is assignable from a plain object without a runtime key', () => {
      const plain = { kind: 'Plain' };
      const like: MaterialLike = plain;
      expect(like.kind).toBe('Plain');
    });
  });

  describe('MaterialData', () => {
    it('accepts any plain object', () => {
      const data: MaterialData = { color: 0xff0000ff, opacity: 1 };
      expect(data).toBeTruthy();
    });
  });

  describe('DefaultMaterialKind', () => {
    it('is the string DefaultMaterial', () => {
      expect(DefaultMaterialKind).toBe('DefaultMaterial');
    });

    it('satisfies the Kind type constraint', () => {
      // Compile-time assertion: DefaultMaterialKind is the literal type 'DefaultMaterial'
      const kindLiteral: 'DefaultMaterial' = DefaultMaterialKind;
      expect(kindLiteral).toBe('DefaultMaterial');
    });
  });
});

// Ensure Material is a proper Entity subtype (has the runtime key field)
type _MaterialExtendsEntity = Material extends Entity ? true : false;
const _materialIsEntity: _MaterialExtendsEntity = true;
void _materialIsEntity;

// Ensure MaterialLike does NOT have the EntityRuntimeKey field
// (EntityWithoutRuntime removes it)
type _MaterialLikeHasRuntimeKey = typeof EntityRuntimeKey extends keyof MaterialLike ? true : false;
const _noRuntimeKey: _MaterialLikeHasRuntimeKey = false;
void _noRuntimeKey;
