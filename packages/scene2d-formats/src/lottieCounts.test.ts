import { describe, expect, it } from 'vitest';

import { collectLottieCounts, getLottieFeatureNames } from './lottieCounts.ts';

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

  // ★ THE CENSUS REPORTS THE MASK MODE THE DOCUMENT ASKS FOR, WHETHER OR NOT FLIGHT CARRIES IT. Only the additive mode
  // has a handler; the other five are declined by catalog disposition, which is how a reader learns the document needs
  // something. Reporting nothing for them — which is what this did first — reads as "no mask here".
  //
  // `mode: 'n'` is the exception and not an omission: Lottie writes it for a mask entry that is switched OFF, so it is
  // the absence of a feature rather than an unsupported one, and a requirement for it would be a requirement for nothing.
  it('reports every mask mode the document asks for, and nothing for a disabled one', () => {
    const masked = (mode: string) => ({
      fr: 30,
      ip: 0,
      layers: [{ ind: 1, ip: 0, masksProperties: [{ mode, o: { k: 100 }, pt: { k: {} } }], op: 60, ty: 3 }],
      op: 60,
    });
    const expected = new Map([
      ['a', 'mask.additive'],
      ['d', 'mask.darken'],
      ['f', 'mask.difference'],
      ['i', 'mask.intersect'],
      ['l', 'mask.lighten'],
      ['s', 'mask.subtract'],
    ]);
    for (const [mode, key] of expected) {
      expect([...collectLottieCounts(JSON.stringify(masked(mode)))!.keys()].sort(), mode).toEqual(
        ['layer.null', key].sort(),
      );
    }
    expect([...collectLottieCounts(JSON.stringify(masked('n')))!.keys()]).toEqual(['layer.null']);
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

// ★ THE VOCABULARY AND THE CENSUS MUST NOT BE ABLE TO DISAGREE. The catalog's disposition gate partitions this list
// against the handler rows, so a feature the census can emit but the list omits would be a requirement nothing accounts
// for — and the gate would pass by looking at less. Asserting the count and a sample of each family is what pins the
// derivation rather than restating it.
describe('getLottieFeatureNames', () => {
  it('names every feature the census can emit, across all three families', () => {
    const names = getLottieFeatureNames();
    expect(names).toHaveLength(21);
    expect(names).toEqual([...names].sort());
    expect(names.filter((name) => name.startsWith('layer.'))).toHaveLength(6);
    expect(names.filter((name) => name.startsWith('mask.'))).toHaveLength(6);
    expect(names.filter((name) => name.startsWith('shape.'))).toHaveLength(9);
  });

  it('contains every key a document can actually produce', () => {
    const document = {
      fr: 30,
      ip: 0,
      layers: [
        { ind: 1, ip: 0, masksProperties: [{ mode: 's', o: { k: 100 }, pt: { k: {} } }], op: 60, ty: 3 },
        { ind: 2, ip: 0, op: 60, shapes: [{ ty: 'rc' }, { ty: 'fl' }, { ty: 'tm' }], ty: 4 },
      ],
      op: 60,
    };
    const names = new Set(getLottieFeatureNames());
    for (const key of collectLottieCounts(JSON.stringify(document))!.keys()) {
      expect(names.has(key), key).toBe(true);
    }
  });
});
