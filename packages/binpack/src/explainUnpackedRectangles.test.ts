import { describe, expect, it } from 'vitest';

import { explainUnpackedRectangles } from './explainUnpackedRectangles';

describe('explainUnpackedRectangles', () => {
  it('returns nothing when everything was placed', () => {
    expect(explainUnpackedRectangles([{ id: 'a', width: 8, height: 8 }])).toEqual([]);
  });

  it('separates oversized from binExhausted, which have different remedies', () => {
    // 'huge' can never fit any bin within the caps; 'filler' fits in principle and loses the race.
    const explanations = explainUnpackedRectangles(
      [
        { id: 'huge', width: 500, height: 10 },
        { id: 'filler', width: 90, height: 90 },
        { id: 'filler2', width: 90, height: 90 },
      ],
      { maxWidth: 100, maxHeight: 100, growable: false },
    );
    const byId = new Map(explanations.map((e) => [e.id, e.reason]));
    expect(byId.get('huge')).toBe('oversized');
    expect(byId.get('filler2')).toBe('binExhausted');
  });

  it('blames the collapsed region rather than the pieces when border eats the caps', () => {
    // Every piece fails for ONE reason here; calling each 'oversized' would send the caller after the
    // rectangles instead of after the border.
    const explanations = explainUnpackedRectangles(
      [
        { id: 'a', width: 2, height: 2 },
        { id: 'b', width: 2, height: 2 },
      ],
      { maxWidth: 10, maxHeight: 10, border: 6, growable: false },
    );
    expect(explanations.map((e) => e.reason)).toEqual(['regionCollapsed', 'regionCollapsed']);
    expect(explanations[0].usableWidth).toBeLessThanOrEqual(0);
  });

  it('counts rotation as a real second chance before calling a piece oversized', () => {
    const rects = [{ id: 'tall', width: 10, height: 200 }];
    const options = { maxWidth: 300, maxHeight: 100, growable: false } as const;
    expect(explainUnpackedRectangles(rects, options)[0].reason).toBe('oversized');
    // Rotated it is 200x10, which fits inside 300x100 — so it is not oversized, it merely lost.
    expect(explainUnpackedRectangles(rects, { ...options, allowRotation: true })).toEqual([]);
  });

  it('reports the usable extent it measured against, net of border', () => {
    const [explanation] = explainUnpackedRectangles([{ id: 'a', width: 999, height: 4 }], {
      maxWidth: 100,
      maxHeight: 100,
      border: 5,
      growable: false,
    });
    expect(explanation).toMatchObject({ id: 'a', usableWidth: 90, usableHeight: 90 });
  });
});
