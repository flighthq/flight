import { describe, expect, it } from 'vitest';

import { FEATURE_INDEX_LIMIT, packContactFeatureId } from './contactFeatureId';

describe('packContactFeatureId', () => {
  it('separates the exact face pairs the previous shift packing aliased', () => {
    // The reported regression, stated as arithmetic rather than hoped for through geometry: shifting an
    // unmasked incident index left by 1 into a 10-bit field spilled it into the reference field, so face
    // pair (0, 1024) and face pair (1, 0) produced one id. A solver keyed on that id would warm-start
    // one contact with an impulse belonging to a different pair of faces entirely.
    expect(((0 << 11) | (1024 << 1)) === ((1 << 11) | (0 << 1))).toBe(true); // the old collision
    expect(packContactFeatureId(true, 0, 1024, false)).not.toBe(packContactFeatureId(true, 1, 0, false));
  });

  it('gives every distinct feature its own id across the packing boundaries', () => {
    // Sweeps each field across the values where a fixed-width packing wraps — its own boundary and the
    // one below it — and checks the whole cross product collides nowhere.
    const edges = [0, 1, 2, 1023, 1024, 1025, 2047, 2048, FEATURE_INDEX_LIMIT - 1];
    const seen = new Map<number, string>();
    for (const referenceIsA of [false, true]) {
      for (const referenceEdge of edges) {
        for (const incidentEdge of edges) {
          for (const secondPoint of [false, true]) {
            const id = packContactFeatureId(referenceIsA, referenceEdge, incidentEdge, secondPoint);
            const key = `${referenceIsA}/${referenceEdge}/${incidentEdge}/${secondPoint}`;
            expect(seen.get(id)).toBeUndefined();
            seen.set(id, key);
          }
        }
      }
    }
    expect(seen.size).toBe(2 * edges.length * edges.length * 2);
  });

  it('stays an exactly representable integer at the widest packing', () => {
    // Every id must survive as an exact integer: one rounded id is two features sharing an identity.
    const widest = packContactFeatureId(true, FEATURE_INDEX_LIMIT - 1, FEATURE_INDEX_LIMIT - 1, true);
    expect(Number.isSafeInteger(widest)).toBe(true);
    expect(widest).toBeLessThan(Number.MAX_SAFE_INTEGER);
    expect(widest + 1).not.toBe(widest);
  });

  it('distinguishes the two contact points of one face pair', () => {
    expect(packContactFeatureId(true, 3, 7, false)).not.toBe(packContactFeatureId(true, 3, 7, true));
  });

  it('distinguishes which shape owned the reference face', () => {
    expect(packContactFeatureId(false, 3, 7, false)).not.toBe(packContactFeatureId(true, 3, 7, false));
  });
});
