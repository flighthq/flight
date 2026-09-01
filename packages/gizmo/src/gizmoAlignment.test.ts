import { createRectangle } from '@flighthq/geometry/contract';
import type { GizmoAlignment, GizmoSmartGuideResult } from '@flighthq/types/contract';

import { computeGizmoAlignmentDeltas, findGizmoSmartGuides } from './gizmoAlignment';

describe('computeGizmoAlignmentDeltas', () => {
  it('aligns every selection bound to the combined selection edge', () => {
    const out: number[] = [];
    const bounds = [createRectangle(10, 4, 10, 8), createRectangle(-5, 20, 4, 6), createRectangle(20, -2, -8, 10)];

    computeGizmoAlignmentDeltas(out, bounds, 'left');

    expect(out).toEqual([-15, 0, 0, 0, -17, 0]);
  });

  it.each<[GizmoAlignment, number[]]>([
    ['horizontal-center', [10, 0, -8, 0]],
    ['right', [20, 0, 0, 0]],
    ['top', [0, -30, 0, 0]],
    ['vertical-center', [0, -15, 0, 20]],
    ['bottom', [0, 0, 0, 40]],
  ])('aligns every selection bound using %s', (alignment, expected) => {
    const out: number[] = [];
    const bounds = [createRectangle(-10, 10, 4, 20), createRectangle(6, -20, 8, 10)];

    computeGizmoAlignmentDeltas(out, bounds, alignment);

    expect(out).toEqual(expected);
  });

  it('clears stale output for an empty selection', () => {
    const out = [1, 2, 3, 4];

    computeGizmoAlignmentDeltas(out, [], 'bottom');

    expect(out).toEqual([]);
  });
});

describe('findGizmoSmartGuides', () => {
  it('chooses the closest edge or center independently on each axis', () => {
    const out: GizmoSmartGuideResult = { deltaX: 99, deltaY: 99, guideX: 99, guideY: 99 };
    const moving = createRectangle(10, 20, 10, 10);
    const candidates = [createRectangle(23, 100, 10, 10), createRectangle(100, 32, 10, 5)];

    expect(findGizmoSmartGuides(out, moving, candidates, 3)).toBe(true);
    expect(out).toEqual({ deltaX: 3, deltaY: 2, guideX: 23, guideY: 32 });
  });

  it('uses candidate and anchor order to break equal-distance ties deterministically', () => {
    const out: GizmoSmartGuideResult = { deltaX: 0, deltaY: 0, guideX: null, guideY: null };
    const moving = createRectangle(-10, 20, -10, -10);
    const candidates = [createRectangle(-7, 100, 4, 4), createRectangle(-30, 100, 7, 4)];

    expect(findGizmoSmartGuides(out, moving, candidates, 3)).toBe(true);
    expect(out).toEqual({ deltaX: 3, deltaY: 0, guideX: -7, guideY: null });
  });

  it('resets stale output when no guide is within a finite non-negative threshold', () => {
    const out: GizmoSmartGuideResult = { deltaX: 99, deltaY: 99, guideX: 99, guideY: 99 };
    const moving = createRectangle(0, 0, 10, 10);
    const candidates = [createRectangle(100, 100, 10, 10)];

    expect(findGizmoSmartGuides(out, moving, candidates, 2)).toBe(false);
    expect(out).toEqual({ deltaX: 0, deltaY: 0, guideX: null, guideY: null });
    expect(findGizmoSmartGuides(out, moving, candidates, Number.POSITIVE_INFINITY)).toBe(false);
  });
});
