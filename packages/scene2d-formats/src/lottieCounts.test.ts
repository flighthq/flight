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
