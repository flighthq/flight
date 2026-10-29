// Generated from crates/flight-clip/tests/clip_region_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { createMatrix, createRectangle } from '@flighthq/geometry/contract';
import { appendPathLineTo, appendPathMoveTo, createPath } from '@flighthq/path/contract';
import { describe, expect, it } from 'vitest';

import {
  acquireClipRegion,
  clipRegionContainsClipRegion,
  clipRegionContainsPoint,
  clipRegionContainsRectangle,
  clipRegionIntersectsClipRegion,
  clipRegionIntersectsRectangle,
  cloneClipRegion,
  copyClipRegion,
  createClipRegionFromCircle,
  createClipRegionFromContours,
  createClipRegionFromEllipse,
  createClipRegionFromPath,
  createClipRegionFromRectangle,
  createClipRegionFromRoundedRectangle,
  equalsClipRegion,
  explainClipRegion,
  explainClipRegionContours,
  getClipRegionBounds,
  initializeClipRegionFromContours,
  initializeClipRegionFromPath,
  initializeClipRegionFromRectangle,
  intersectClipRegions,
  invalidateClipRegion,
  isClipRegionEmpty,
  isClipRegionRectangular,
  normalizeClipRegion,
  releaseClipRegion,
  setClipRegionContoursGuard,
  setClipRegionReleaseGuard,
  setClipRegionToContours,
  setClipRegionToRectangle,
  setClipRegionUseGuard,
  transformClipRegion,
  unionClipRegions,
} from './contract.ts';

type SharedGuardCalls = { value: GuardCalls };

interface GuardCalls {
  values: number[];
}

function contours(): number[][] {
  return [[0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0]];
}

function triangle(): number[][] {
  return [[0.0, 0.0, 10.0, 0.0, 5.0, 10.0]];
}

function guardCalls(): SharedGuardCalls {
  return { value: { values: [] } };
}

describe('acquireClipRegion', () => {
  it('returns distinct regions then reuses and resets a released region', () => {
    const a = acquireClipRegion();
    const b = acquireClipRegion();
    expect(!(a === b)).toBe(true);
    setClipRegionToContours(a, triangle(), 'evenOdd');
    releaseClipRegion(a);
    let reused = acquireClipRegion();
    expect(a === reused).toBe(true);
    reused = reused!;
    expect(reused.rect.x).toEqual(0.0);
    expect(reused.contours).toEqual(null);
    expect(reused.winding).toEqual('nonZero');
    expect(reused.version).toEqual(0);
  });
});

describe('clipRegionContainsClipRegion', () => {
  it('uses bounds conservatively for contour regions', () => {
    const outer = createClipRegionFromContours(triangle(), 'nonZero');
    const inner = createClipRegionFromRectangle(createRectangle(8.0, 8.0, 1.0, 1.0));
    expect(clipRegionContainsClipRegion(outer, inner)).toBe(true);
  });
});

describe('clipRegionContainsPoint', () => {
  it('tests rectangles and contours with the declared winding', () => {
    const rectangle = createClipRegionFromRectangle(createRectangle(0.0, 0.0, 10.0, 10.0));
    expect(clipRegionContainsPoint(rectangle, 5.0, 5.0)).toBe(true);
    expect(!clipRegionContainsPoint(rectangle, 15.0, 5.0)).toBe(true);
    const triangleClip = createClipRegionFromContours(triangle(), 'nonZero');
    expect(clipRegionContainsPoint(triangleClip, 5.0, 4.0)).toBe(true);
    expect(!clipRegionContainsPoint(triangleClip, 0.0, 9.0)).toBe(true);
  });
});

describe('clipRegionContainsRectangle', () => {
  it('answers from bounds for both region forms', () => {
    const clip = createClipRegionFromRectangle(createRectangle(0.0, 0.0, 100.0, 100.0));
    expect(clipRegionContainsRectangle(clip, createRectangle(10.0, 10.0, 20.0, 20.0))).toBe(true);
    expect(!clipRegionContainsRectangle(clip, createRectangle(90.0, 90.0, 20.0, 20.0))).toBe(true);
  });
});

describe('clipRegionIntersectsClipRegion', () => {
  it('rejects disjoint region bounds', () => {
    const a = createClipRegionFromRectangle(createRectangle(0.0, 0.0, 10.0, 10.0));
    const b = createClipRegionFromRectangle(createRectangle(20.0, 20.0, 5.0, 5.0));
    expect(!clipRegionIntersectsClipRegion(a, b)).toBe(true);
  });
});

describe('clipRegionIntersectsRectangle', () => {
  it('reports overlap and disjoint bounds', () => {
    const clip = createClipRegionFromContours(triangle(), 'nonZero');
    expect(clipRegionIntersectsRectangle(clip, createRectangle(8.0, 8.0, 1.0, 1.0))).toBe(true);
    expect(!clipRegionIntersectsRectangle(clip, createRectangle(20.0, 20.0, 1.0, 1.0))).toBe(true);
  });
});

describe('cloneClipRegion', () => {
  it('preserves version and deep copies geometry into a fresh entity', () => {
    const source = createClipRegionFromContours(contours(), 'evenOdd');
    source!.version = 7;
    const cloned = cloneClipRegion(source);
    expect(!(source === cloned)).toBe(true);
    expect(equalsClipRegion(source, cloned)).toBe(true);
    expect(source!.version).toEqual(cloned!.version);
    cloned!.contours![0][0] = 99.0;
    expect(source!.contours![0][0]).toEqual(0.0);
  });
});

describe('copyClipRegion', () => {
  it('overwrites out bumps version and is an identity no op', () => {
    const source = createClipRegionFromContours(triangle(), 'evenOdd');
    const out = createClipRegionFromRectangle(createRectangle(2.0, 3.0, 4.0, 5.0));
    out!.version = 10;
    copyClipRegion(out, source);
    expect(out!.version).toEqual(11);
    expect(out!.contours).toEqual(triangle());
    copyClipRegion(out, out);
    expect(out!.version).toEqual(11);
  });
});

describe('createClipRegionFromCircle', () => {
  it('creates a contour with the circle bounds', () => {
    let clip = createClipRegionFromCircle(50.0, 50.0, 20.0, undefined);
    clip = clip!;
    expect(clip.contours !== null).toBe(true);
    expect(Math.abs(clip.rect.x - 30.0) < 0.5).toBe(true);
    expect(Math.abs(clip.rect.width - 40.0) < 0.5).toBe(true);
  });
});

describe('createClipRegionFromContours', () => {
  it('deep copies valid input and skips malformed contours for bounds', () => {
    let input = contours();
    const clip = createClipRegionFromContours(input, 'nonZero');
    input[0][2] = 999.0;
    expect(clip!.contours![0][2]).toEqual(10.0);
    expect(clip!.rect.width).toEqual(10.0);
    const malformed = [
      [0.0, 0.0, 10.0],
      [0.0, 0.0, 10.0, 0.0],
      [0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0],
    ];
    const empty = createClipRegionFromContours(malformed, 'nonZero');
    expect(isClipRegionEmpty(empty)).toBe(true);
  });
});

describe('createClipRegionFromEllipse', () => {
  it('creates a contour with the source rectangle bounds', () => {
    let clip = createClipRegionFromEllipse(createRectangle(10.0, 20.0, 40.0, 30.0), undefined);
    clip = clip!;
    expect(clip.contours !== null).toBe(true);
    expect(Math.abs(clip.rect.x - 10.0) < 0.5).toBe(true);
    expect(Math.abs(clip.rect.height - 30.0) < 0.5).toBe(true);
  });
});

describe('createClipRegionFromPath', () => {
  it('flattens path geometry and uses its winding', () => {
    let path = createPath('nonZero');
    path.winding = 'evenOdd';
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 10.0, 0.0);
    appendPathLineTo(path, 10.0, 10.0);
    let clip = createClipRegionFromPath(path, undefined);
    clip = clip!;
    expect(clip.rect.width).toEqual(10.0);
    expect(clip.rect.height).toEqual(10.0);
    expect(clip.winding).toEqual('evenOdd');
  });
});

describe('createClipRegionFromRectangle', () => {
  it('copies the rectangle into the scissor eligible form', () => {
    let rectangle = createRectangle(5.0, 6.0, 20.0, 30.0);
    let clip = createClipRegionFromRectangle(rectangle);
    rectangle.x = 99.0;
    clip = clip!;
    expect(clip.rect.x).toEqual(5.0);
    expect(clip.contours).toEqual(null);
    expect(clip.version).toEqual(0);
  });
});

describe('createClipRegionFromRoundedRectangle', () => {
  it('uses contours for positive radius and rect form for zero radius', () => {
    const rectangle = createRectangle(0.0, 0.0, 100.0, 60.0);
    const rounded = createClipRegionFromRoundedRectangle(rectangle, 10.0, undefined);
    const plain = createClipRegionFromRoundedRectangle(rectangle, 0.0, undefined);
    expect(rounded!.contours !== null).toBe(true);
    expect(plain!.contours === null).toBe(true);
  });
});

describe('equalsClipRegion', () => {
  it('compares geometry and winding but not version', () => {
    const a = createClipRegionFromContours(triangle(), 'nonZero');
    const b = createClipRegionFromContours(triangle(), 'nonZero');
    b!.version = 99;
    expect(equalsClipRegion(a, b)).toBe(true);
    b!.winding = 'evenOdd';
    expect(!equalsClipRegion(a, b)).toBe(true);
    expect(equalsClipRegion(a, a)).toBe(true);
  });
});

describe('explainClipRegion', () => {
  it('reports conservative geometry and pool ownership', () => {
    const clip = createClipRegionFromContours(triangle(), 'nonZero');
    expect(explainClipRegion(clip).conservative).toBe(true);
    releaseClipRegion(clip);
    const explanation = explainClipRegion(clip);
    expect(explanation.conservative).toBe(true);
    acquireClipRegion();
  });
});

describe('explainClipRegionContours', () => {
  it('reports the first problem with odd runs before short runs', () => {
    let explanation = explainClipRegionContours([[0.0, 0.0, 1.0]])!;
    expect(explanation.contourIndex).toEqual(0);
    expect(explanation.coordinateCount).toEqual(3);
    explanation = explainClipRegionContours([[0.0, 0.0, 1.0, 1.0]])!;
    expect(explanation.coordinateCount).toEqual(4);
    expect(explainClipRegionContours(contours())).toEqual(null);
  });
});

describe('getClipRegionBounds', () => {
  it('copies bounds into the caller owned out rectangle', () => {
    const clip = createClipRegionFromRectangle(createRectangle(2.0, 3.0, 4.0, 5.0));
    let out = createRectangle(0.0, 0.0, 0.0, 0.0);
    getClipRegionBounds(out, clip);
    expect(out).toEqual(createRectangle(2.0, 3.0, 4.0, 5.0));
  });
});

describe('initializeClipRegionFromContours', () => {
  it('initializes preallocated entity storage', () => {
    const out = createClipRegionFromRectangle(createRectangle(0.0, 0.0, 0.0, 0.0));
    initializeClipRegionFromContours(out!, triangle(), 'evenOdd');
    expect(out!.contours).toEqual(triangle());
    expect(out!.winding).toEqual('evenOdd');
  });
});

describe('initializeClipRegionFromPath', () => {
  it('initializes preallocated entity storage', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 3.0, 4.0);
    appendPathLineTo(path, 6.0, 0.0);
    const out = createClipRegionFromRectangle(createRectangle(0.0, 0.0, 0.0, 0.0));
    initializeClipRegionFromPath(out!, path, undefined);
    expect(out!.rect.width).toEqual(6.0);
    expect(out!.rect.height).toEqual(4.0);
  });
});

describe('initializeClipRegionFromRectangle', () => {
  it('initializes preallocated entity storage', () => {
    const out = createClipRegionFromRectangle(createRectangle(0.0, 0.0, 0.0, 0.0));
    initializeClipRegionFromRectangle(out!, createRectangle(1.0, 2.0, 3.0, 4.0));
    expect(out!.rect).toEqual(createRectangle(1.0, 2.0, 3.0, 4.0));
    expect(out!.contours).toEqual(null);
  });
});

describe('intersectClipRegions', () => {
  it('is alias safe and preserves contours for mixed inputs', () => {
    let a = createClipRegionFromContours(contours(), 'evenOdd');
    const b = createClipRegionFromRectangle(createRectangle(5.0, 5.0, 10.0, 10.0));
    intersectClipRegions(a, a, b);
    a = a!;
    expect(a.rect).toEqual(createRectangle(5.0, 5.0, 5.0, 5.0));
    expect(a.contours !== null).toBe(true);
    expect(a.winding).toEqual('evenOdd');
    expect(a.version).toEqual(1);
  });
  it('returns canonical empty for disjoint inputs', () => {
    const a = createClipRegionFromRectangle(createRectangle(0.0, 0.0, 1.0, 1.0));
    const b = createClipRegionFromRectangle(createRectangle(2.0, 2.0, 1.0, 1.0));
    const out = createClipRegionFromRectangle(createRectangle(9.0, 9.0, 9.0, 9.0));
    intersectClipRegions(out, a, b);
    expect(out!.rect).toEqual(createRectangle(0.0, 0.0, 0.0, 0.0));
    expect(out!.contours).toEqual(null);
  });
});

describe('invalidateClipRegion', () => {
  it('increments and wraps the u32 version', () => {
    const clip = createClipRegionFromRectangle(createRectangle(0.0, 0.0, 1.0, 1.0));
    clip!.version = 0xffffffff;
    invalidateClipRegion(clip);
    expect(clip!.version).toEqual(0);
  });
});

describe('isClipRegionEmpty', () => {
  it('treats empty bounds or an empty contour list as empty', () => {
    expect(isClipRegionEmpty(createClipRegionFromRectangle(createRectangle(0.0, 0.0, 0.0, 10.0)))).toBe(true);
    expect(!isClipRegionEmpty(createClipRegionFromRectangle(createRectangle(0.0, 0.0, 10.0, 10.0)))).toBe(true);
    const contourClip = createClipRegionFromContours([], 'nonZero');
    contourClip!.rect = createRectangle(0.0, 0.0, 10.0, 10.0);
    expect(isClipRegionEmpty(contourClip)).toBe(true);
  });
});

describe('isClipRegionRectangular', () => {
  it('discriminates the scissor form from contours', () => {
    expect(isClipRegionRectangular(createClipRegionFromRectangle(createRectangle(0.0, 0.0, 1.0, 1.0)))).toBe(true);
    const contourClip = createClipRegionFromContours(triangle(), 'nonZero');
    expect(!isClipRegionRectangular(contourClip)).toBe(true);
  });
});

describe('moduleClipRegionState', () => {
  it('all operations share the module pool binding', () => {
    const region = acquireClipRegion();
    releaseClipRegion(region);
    expect(acquireClipRegion() === region).toBe(true);
  });
});

describe('normalizeClipRegion', () => {
  it('restores quad contours to rect form and is alias safe for non rectangles', () => {
    const quad = createClipRegionFromContours(contours(), 'evenOdd');
    normalizeClipRegion(quad, quad);
    expect(quad!.contours).toEqual(null);
    expect(quad!.rect).toEqual(createRectangle(0.0, 0.0, 10.0, 10.0));
    expect(quad!.winding).toEqual('nonZero');
    const triangleClip = createClipRegionFromContours(triangle(), 'evenOdd');
    normalizeClipRegion(triangleClip, triangleClip);
    expect(triangleClip!.contours).toEqual(triangle());
    expect(triangleClip!.winding).toEqual('evenOdd');
  });
});

describe('releaseClipRegion', () => {
  it('returns the exact shared region to the pool', () => {
    const region = acquireClipRegion();
    releaseClipRegion(region);
    expect(region === acquireClipRegion()).toBe(true);
  });
});

describe('setClipRegionContoursGuard', () => {
  it('replaces the module callback slot', () => {
    const calls = guardCalls();
    const recorded = calls;
    setClipRegionContoursGuard((_unused0, _unused1) => {
      recorded.value.values.push(1);
    });
    createClipRegionFromContours([[0.0, 0.0, 1.0]], 'nonZero');
    expect(calls.value.values.length).toEqual(1);
    setClipRegionContoursGuard(null);
  });
});

describe('setClipRegionReleaseGuard', () => {
  it('replaces the module callback slot', () => {
    const calls = guardCalls();
    const recorded = calls;
    setClipRegionReleaseGuard((_unused0) => {
      recorded.value.values.push(1);
    });
    const clip = acquireClipRegion();
    releaseClipRegion(clip);
    releaseClipRegion(clip);
    expect(calls.value.values.length).toEqual(1);
    acquireClipRegion();
    acquireClipRegion();
    setClipRegionReleaseGuard(null);
  });
});

describe('setClipRegionToContours', () => {
  it('deep copies recomputes bounds and bumps version', () => {
    let out = createClipRegionFromRectangle(createRectangle(0.0, 0.0, 0.0, 0.0));
    let source = triangle();
    setClipRegionToContours(out, source, 'evenOdd');
    source[0][0] = 99.0;
    out = out!;
    expect(out.contours).toEqual(triangle());
    expect(out.rect).toEqual(createRectangle(0.0, 0.0, 10.0, 10.0));
    expect(out.version).toEqual(1);
  });
});

describe('setClipRegionToRectangle', () => {
  it('retargets contours to scissor form and bumps version', () => {
    let out = createClipRegionFromContours(triangle(), 'evenOdd');
    setClipRegionToRectangle(out, createRectangle(5.0, 6.0, 7.0, 8.0));
    out = out!;
    expect(out.contours).toEqual(null);
    expect(out.rect).toEqual(createRectangle(5.0, 6.0, 7.0, 8.0));
    expect(out.winding).toEqual('nonZero');
    expect(out.version).toEqual(1);
  });
});

describe('setClipRegionUseGuard', () => {
  it('replaces the module callback slot', () => {
    const calls = guardCalls();
    const recorded = calls;
    setClipRegionUseGuard((_unused0) => {
      recorded.value.values.push(1);
    });
    const clip = acquireClipRegion();
    releaseClipRegion(clip);
    clipRegionContainsPoint(clip, 0.0, 0.0);
    expect(calls.value.values.length).toEqual(1);
    acquireClipRegion();
    setClipRegionUseGuard(null);
  });
});

describe('transformClipRegion', () => {
  it('preserves rect form for axis alignment and promotes rotation to a quad', () => {
    const clip = createClipRegionFromRectangle(createRectangle(0.0, 0.0, 10.0, 10.0));
    transformClipRegion(clip, clip, createMatrix(2.0, 0.0, 0.0, 2.0, 5.0, 5.0));
    expect(clip!.rect).toEqual(createRectangle(5.0, 5.0, 20.0, 20.0));
    expect(clip!.contours).toEqual(null);
    const rotated = createClipRegionFromRectangle(createRectangle(0.0, 0.0, 10.0, 10.0));
    transformClipRegion(rotated, rotated, createMatrix(0.0, 1.0, -1.0, 0.0, 10.0, 0.0));
    expect(rotated!.contours![0].length).toEqual(8);
    expect(rotated!.rect).toEqual(createRectangle(0.0, 0.0, 10.0, 10.0));
  });
  it('transforms contours alias safely', () => {
    const clip = createClipRegionFromContours(triangle(), 'evenOdd');
    transformClipRegion(clip, clip, createMatrix(1.0, 0.0, 0.0, 1.0, 5.0, 7.0));
    expect(clip!.contours).toEqual([[5.0, 7.0, 15.0, 7.0, 10.0, 17.0]]);
  });
});

describe('unionClipRegions', () => {
  it('is alias safe and keeps contours from the richer input', () => {
    const a = createClipRegionFromContours(triangle(), 'evenOdd');
    let b = createClipRegionFromRectangle(createRectangle(5.0, 5.0, 20.0, 20.0));
    unionClipRegions(b, a, b);
    b = b!;
    expect(b.rect).toEqual(createRectangle(0.0, 0.0, 25.0, 25.0));
    expect(b.contours).toEqual(triangle());
    expect(b.winding).toEqual('evenOdd');
    expect(b.version).toEqual(1);
  });
});
