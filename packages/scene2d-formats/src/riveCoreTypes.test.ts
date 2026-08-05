import { getRiveCoreTypeName, isRiveCoreTypeDerivedFrom } from './riveCoreTypes';

describe('getRiveCoreTypeName', () => {
  it('names the types a reader meets first', () => {
    expect(getRiveCoreTypeName(1)).toBe('Artboard');
    expect(getRiveCoreTypeName(2)).toBe('Node');
    expect(getRiveCoreTypeName(3)).toBe('Shape');
    expect(getRiveCoreTypeName(23)).toBe('Backboard');
  });

  it('returns undefined for a key the object model does not define', () => {
    expect(getRiveCoreTypeName(0)).toBeUndefined();
    expect(getRiveCoreTypeName(999999)).toBeUndefined();
  });
});

describe('isRiveCoreTypeDerivedFrom', () => {
  it('treats a type as derived from itself, so the test reads as "is a"', () => {
    expect(isRiveCoreTypeDerivedFrom(3, 3)).toBe(true);
  });

  it('walks the declared inheritance chain', () => {
    // Ellipse extends ParametricPath extends Path extends Node extends TransformComponent, and every
    // drawable is ultimately a Component. Testing type keys for equality would miss all of this.
    expect(isRiveCoreTypeDerivedFrom(4, 2)).toBe(true);
    expect(isRiveCoreTypeDerivedFrom(4, 10)).toBe(true);
    expect(isRiveCoreTypeDerivedFrom(3, 10)).toBe(true);
  });

  it('does not invent inheritance that is not declared', () => {
    expect(isRiveCoreTypeDerivedFrom(2, 4)).toBe(false);
    expect(isRiveCoreTypeDerivedFrom(23, 10)).toBe(false);
    expect(isRiveCoreTypeDerivedFrom(999999, 10)).toBe(false);
  });

  // The registry is generated, so its own structure is worth asserting rather than assuming: a cycle
  // or a dangling parent would make the walk above loop or silently stop short.
  it('holds an acyclic graph in which every declared parent resolves', () => {
    let deepest = 0;
    for (let key = 0; key < 1200; key++) {
      if (getRiveCoreTypeName(key) === undefined) continue;
      const seen = new Set<number>();
      let current = key;
      let depth = 0;
      for (;;) {
        expect(seen.has(current)).toBe(false);
        seen.add(current);
        const parent = findParent(current);
        if (parent === undefined) break;
        expect(getRiveCoreTypeName(parent)).toBeDefined();
        current = parent;
        depth++;
      }
      deepest = Math.max(deepest, depth);
    }

    expect(deepest).toBe(8);
  });
});

// Recovers the immediate parent through the public surface: the nearest key the type is derived from
// that is not itself.
function findParent(typeKey: number): number | undefined {
  for (let candidate = 0; candidate < 1200; candidate++) {
    if (candidate === typeKey) continue;
    if (!isRiveCoreTypeDerivedFrom(typeKey, candidate)) continue;
    if (isRiveCoreTypeDerivedFrom(typeKey, candidate) && isParentOf(candidate, typeKey)) return candidate;
  }
  return undefined;
}

function isParentOf(candidate: number, typeKey: number): boolean {
  for (let other = 0; other < 1200; other++) {
    if (other === typeKey || other === candidate) continue;
    if (isRiveCoreTypeDerivedFrom(typeKey, other) && isRiveCoreTypeDerivedFrom(other, candidate)) return false;
  }
  return true;
}
