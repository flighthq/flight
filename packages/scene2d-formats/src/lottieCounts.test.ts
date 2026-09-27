import { describe, expect, it } from 'vitest';

import { collectLottieCounts } from './lottieCounts.ts';

describe('collectLottieCounts', () => {
  it('returns null for invalid JSON', () => {
    expect(collectLottieCounts('not json')).toBeNull();
  });

  it('returns null for non-Lottie JSON', () => {
    expect(collectLottieCounts(JSON.stringify({ armature: [] }))).toBeNull();
    expect(collectLottieCounts(JSON.stringify({ foo: 1 }))).toBeNull();
  });

  it('returns null when fr is zero or missing', () => {
    expect(collectLottieCounts(JSON.stringify({ fr: 0, ip: 0, layers: [], op: 1 }))).toBeNull();
    expect(collectLottieCounts(JSON.stringify({ ip: 0, layers: [], op: 1 }))).toBeNull();
  });

  // ★ THE CENSUS COUNTS THE MASKS FLIGHT HAS A FAMILY FOR, AND SAYS SO BY COUNTING NOTHING ELSE. Lottie declares seven
  // mask modes and Flight carries the additive one; emitting a key for a subtract mask would manufacture a requirement
  // no catalog row can satisfy. The second assertion is the one that pins the limit rather than the feature.
  it('tallies additive masks and stays silent about the modes no family carries', () => {
    const masked = (mode: string) => ({
      fr: 30,
      ip: 0,
      layers: [{ ind: 1, ip: 0, masksProperties: [{ mode, o: { k: 100 }, pt: { k: {} } }], op: 60, ty: 3 }],
      op: 60,
    });
    expect(collectLottieCounts(JSON.stringify(masked('a')))!.get('mask.additive')).toBe(1);
    for (const mode of ['d', 'f', 'i', 'l', 'n', 's']) {
      expect([...collectLottieCounts(JSON.stringify(masked(mode)))!.keys()], mode).toEqual(['layer.null']);
    }
  });

  it('returns empty counts for a valid document with no layers', () => {
    const doc = { fr: 30, ip: 0, layers: [], op: 60 };
    const counts = collectLottieCounts(JSON.stringify(doc));
    expect(counts).not.toBeNull();
    expect(counts!.size).toBe(0);
  });

  it('counts layer kinds', () => {
    const doc = {
      fr: 30,
      ip: 0,
      layers: [{ ty: 4 }, { ty: 4 }, { ty: 1 }, { ty: 2 }],
      op: 60,
    };
    const counts = collectLottieCounts(JSON.stringify(doc))!;
    expect(counts.get('layer.shape')).toBe(2);
    expect(counts.get('layer.solid')).toBe(1);
    expect(counts.get('layer.image')).toBe(1);
  });

  it('counts shape items within shape layers', () => {
    const doc = {
      fr: 30,
      ip: 0,
      layers: [
        {
          shapes: [{ ty: 'sh' }, { ty: 'fl' }, { ty: 'gr', it: [{ ty: 'rc' }, { ty: 'st' }] }],
          ty: 4,
        },
      ],
      op: 60,
    };
    const counts = collectLottieCounts(JSON.stringify(doc))!;
    expect(counts.get('shape.path')).toBe(1);
    expect(counts.get('shape.fill')).toBe(1);
    expect(counts.get('shape.rectangle')).toBe(1);
    expect(counts.get('shape.stroke')).toBe(1);
  });
});
