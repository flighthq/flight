import { createMatrix, createRectangle } from '@flighthq/geometry';
import { appendPathLineTo, appendPathMoveTo, createPath } from '@flighthq/path';

import {
  acquireClipRegion,
  clipRegionContainsPoint,
  clipRegionContainsRectangle,
  clipRegionIntersectsRectangle,
  clipRegionsEqual,
  cloneClipRegion,
  copyClipRegion,
  createClipRegionFromCircle,
  createClipRegionFromContours,
  createClipRegionFromEllipse,
  createClipRegionFromPath,
  createClipRegionFromRectangle,
  createClipRegionFromRoundedRectangle,
  getClipRegionBounds,
  intersectClipRegions,
  invalidateClipRegion,
  isClipRegionEmpty,
  isClipRegionRectangular,
  normalizeClipRegion,
  releaseClipRegion,
  setClipRegionToRectangle,
  transformClipRegion,
  unionClipRegions,
} from './clipRegion';

describe('acquireClipRegion', () => {
  it('returns a valid empty rectangular clip region', () => {
    const clip = acquireClipRegion();
    expect(clip.contours).toBeNull();
    expect(clip.rect.width).toBe(0);
    expect(clip.rect.height).toBe(0);
    expect(clip.winding).toBe('nonZero');
    expect(clip.version).toBe(0);
    releaseClipRegion(clip);
  });

  it('returns a fresh object when the pool is empty', () => {
    const a = acquireClipRegion();
    const b = acquireClipRegion();
    expect(a).not.toBe(b);
    releaseClipRegion(a);
    releaseClipRegion(b);
  });

  it('reuses a released region from the pool', () => {
    const first = acquireClipRegion();
    releaseClipRegion(first);
    const second = acquireClipRegion();
    expect(second).toBe(first);
    releaseClipRegion(second);
  });

  it('resets the region state on reuse', () => {
    const clip = acquireClipRegion();
    clip.rect.x = 99;
    clip.rect.width = 50;
    clip.contours = [[1, 2, 3, 4]];
    clip.version = 5;
    releaseClipRegion(clip);

    const reused = acquireClipRegion();
    expect(reused.rect.x).toBe(0);
    expect(reused.rect.width).toBe(0);
    expect(reused.contours).toBeNull();
    expect(reused.version).toBe(0);
    releaseClipRegion(reused);
  });
});

describe('clipRegionContainsPoint', () => {
  it('returns true when the point is inside a rectangular clip', () => {
    const clip = createClipRegionFromRectangle(createRectangle(0, 0, 10, 10));
    expect(clipRegionContainsPoint(clip, 5, 5)).toBe(true);
  });

  it('returns false when the point is outside a rectangular clip', () => {
    const clip = createClipRegionFromRectangle(createRectangle(0, 0, 10, 10));
    expect(clipRegionContainsPoint(clip, 15, 5)).toBe(false);
  });

  it('returns true for a point inside a triangular contour clip (nonZero)', () => {
    const path = createPath('nonZero');
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 10, 0);
    appendPathLineTo(path, 5, 10);
    const clip = createClipRegionFromPath(path);
    expect(clipRegionContainsPoint(clip, 5, 4)).toBe(true);
  });

  it('returns false for a point outside a triangular contour clip', () => {
    const path = createPath('nonZero');
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 10, 0);
    appendPathLineTo(path, 5, 10);
    const clip = createClipRegionFromPath(path);
    expect(clipRegionContainsPoint(clip, 0, 9)).toBe(false);
  });
});

describe('clipRegionContainsRectangle', () => {
  it('returns true when a rectangle is fully inside the clip', () => {
    const clip = createClipRegionFromRectangle(createRectangle(0, 0, 100, 100));
    expect(clipRegionContainsRectangle(clip, createRectangle(10, 10, 20, 20))).toBe(true);
  });

  it('returns false when a rectangle extends outside the clip', () => {
    const clip = createClipRegionFromRectangle(createRectangle(0, 0, 10, 10));
    expect(clipRegionContainsRectangle(clip, createRectangle(5, 5, 20, 20))).toBe(false);
  });
});

describe('clipRegionIntersectsRectangle', () => {
  it('returns true for an overlapping rectangle', () => {
    const clip = createClipRegionFromRectangle(createRectangle(0, 0, 10, 10));
    expect(clipRegionIntersectsRectangle(clip, createRectangle(5, 5, 10, 10))).toBe(true);
  });

  it('returns false for a disjoint rectangle', () => {
    const clip = createClipRegionFromRectangle(createRectangle(0, 0, 10, 10));
    expect(clipRegionIntersectsRectangle(clip, createRectangle(20, 20, 5, 5))).toBe(false);
  });
});

describe('clipRegionsEqual', () => {
  it('returns true for two identical rectangular clips', () => {
    const a = createClipRegionFromRectangle(createRectangle(0, 0, 10, 10));
    const b = createClipRegionFromRectangle(createRectangle(0, 0, 10, 10));
    expect(clipRegionsEqual(a, b)).toBe(true);
  });

  it('returns false when rects differ', () => {
    const a = createClipRegionFromRectangle(createRectangle(0, 0, 10, 10));
    const b = createClipRegionFromRectangle(createRectangle(0, 0, 20, 10));
    expect(clipRegionsEqual(a, b)).toBe(false);
  });

  it('returns true for two identical path clips', () => {
    const path = createPath('nonZero');
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 10, 0);
    appendPathLineTo(path, 10, 10);
    appendPathLineTo(path, 0, 10);
    const a = createClipRegionFromPath(path, 1);
    const b = createClipRegionFromPath(path, 1);
    expect(clipRegionsEqual(a, b)).toBe(true);
  });

  it('returns true for the same object reference', () => {
    const a = createClipRegionFromRectangle(createRectangle(0, 0, 10, 10));
    expect(clipRegionsEqual(a, a)).toBe(true);
  });

  it('returns false when one is rectangular and the other has contours', () => {
    const rect = createClipRegionFromRectangle(createRectangle(0, 0, 10, 10));
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 10, 0);
    appendPathLineTo(path, 10, 10);
    const contour = createClipRegionFromPath(path);
    expect(clipRegionsEqual(rect, contour)).toBe(false);
  });
});

describe('cloneClipRegion', () => {
  it('produces a deep copy of a rectangular clip', () => {
    const original = createClipRegionFromRectangle(createRectangle(5, 6, 20, 30));
    const clone = cloneClipRegion(original);
    expect(clone).not.toBe(original);
    expect(clone.rect).not.toBe(original.rect);
    expect(clone.rect.x).toBe(5);
    expect(clone.rect.y).toBe(6);
    expect(clone.rect.width).toBe(20);
    expect(clone.rect.height).toBe(30);
    expect(clone.contours).toBeNull();
    expect(clone.winding).toBe('nonZero');
  });

  it('produces independent contour arrays', () => {
    const path = createPath('evenOdd');
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 10, 0);
    appendPathLineTo(path, 10, 10);
    appendPathLineTo(path, 0, 10);
    const original = createClipRegionFromPath(path, 1);
    const clone = cloneClipRegion(original);
    expect(clone.contours).not.toBe(original.contours);
    expect(clone.winding).toBe('evenOdd');
  });
});

describe('copyClipRegion', () => {
  it('overwrites out with source data and bumps the version', () => {
    const out = createClipRegionFromRectangle(createRectangle(0, 0, 1, 1));
    const src = createClipRegionFromRectangle(createRectangle(5, 6, 20, 30));
    copyClipRegion(out, src);
    expect(out.rect.x).toBe(5);
    expect(out.rect.y).toBe(6);
    expect(out.rect.width).toBe(20);
    expect(out.rect.height).toBe(30);
    expect(out.version).toBe(1);
  });

  it('is a no-op when out === source', () => {
    const clip = createClipRegionFromRectangle(createRectangle(1, 2, 3, 4));
    const versionBefore = clip.version;
    copyClipRegion(clip, clip);
    expect(clip.version).toBe(versionBefore);
    expect(clip.rect.x).toBe(1);
  });
});

describe('createClipRegionFromCircle', () => {
  it('creates a contour clip whose bounding box approximates the circle', () => {
    const clip = createClipRegionFromCircle(50, 50, 20);
    expect(clip.contours).not.toBeNull();
    expect(clip.rect.x).toBeCloseTo(30, 0);
    expect(clip.rect.y).toBeCloseTo(30, 0);
    expect(clip.rect.width).toBeCloseTo(40, 0);
    expect(clip.rect.height).toBeCloseTo(40, 0);
  });
});

describe('createClipRegionFromContours', () => {
  it('deep-copies the provided contours and computes bounds', () => {
    const contours = [[0, 0, 10, 0, 10, 10, 0, 10]];
    const clip = createClipRegionFromContours(contours, 'nonZero');
    expect(clip.contours).not.toBe(contours);
    expect(clip.contours?.[0]).not.toBe(contours[0]);
    expect(clip.contours).toEqual(contours);
    expect(clip.rect.x).toBe(0);
    expect(clip.rect.y).toBe(0);
    expect(clip.rect.width).toBe(10);
    expect(clip.rect.height).toBe(10);
    expect(clip.winding).toBe('nonZero');
    expect(clip.version).toBe(0);
  });

  it('does not observe later edits to the caller array', () => {
    const contours = [[0, 0, 10, 0, 10, 10, 0, 10]];
    const clip = createClipRegionFromContours(contours, 'nonZero');
    contours[0][2] = 999;
    expect(clip.contours?.[0][2]).toBe(10);
  });

  it('produces an empty region for an empty contours array', () => {
    const clip = createClipRegionFromContours([], 'evenOdd');
    expect(isClipRegionEmpty(clip)).toBe(true);
  });
});

describe('createClipRegionFromEllipse', () => {
  it('creates a contour clip whose bounding box matches the source rectangle', () => {
    const rect = createRectangle(10, 20, 40, 30);
    const clip = createClipRegionFromEllipse(rect);
    expect(clip.contours).not.toBeNull();
    expect(clip.rect.x).toBeCloseTo(10, 0);
    expect(clip.rect.y).toBeCloseTo(20, 0);
    expect(clip.rect.width).toBeCloseTo(40, 0);
    expect(clip.rect.height).toBeCloseTo(30, 0);
  });
});

describe('createClipRegionFromPath', () => {
  it('flattens to contours and bounds the region by their extent', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 10, 0);
    appendPathLineTo(path, 10, 10);
    appendPathLineTo(path, 0, 10);
    const clip = createClipRegionFromPath(path);
    expect(clip.contours).not.toBeNull();
    expect(clip.rect.x).toBeCloseTo(0);
    expect(clip.rect.y).toBeCloseTo(0);
    expect(clip.rect.width).toBeCloseTo(10);
    expect(clip.rect.height).toBeCloseTo(10);
    expect(clip.version).toBe(0);
  });
});

describe('createClipRegionFromRectangle', () => {
  it('copies the rectangle, leaves contours null, and starts at version 0', () => {
    const rectangle = createRectangle(5, 6, 20, 30);
    const clip = createClipRegionFromRectangle(rectangle);
    expect(clip.contours).toBeNull();
    expect(clip.rect).not.toBe(rectangle);
    expect(clip.rect.x).toBe(5);
    expect(clip.rect.y).toBe(6);
    expect(clip.rect.width).toBe(20);
    expect(clip.rect.height).toBe(30);
    expect(clip.version).toBe(0);
  });
});

describe('createClipRegionFromRoundedRectangle', () => {
  it('creates a contour clip for positive radius', () => {
    const rect = createRectangle(0, 0, 100, 60);
    const clip = createClipRegionFromRoundedRectangle(rect, 10);
    expect(clip.contours).not.toBeNull();
    expect(clip.rect.x).toBeCloseTo(0, 0);
    expect(clip.rect.y).toBeCloseTo(0, 0);
    expect(clip.rect.width).toBeCloseTo(100, 0);
    expect(clip.rect.height).toBeCloseTo(60, 0);
  });

  it('falls back to a rectangular clip when radius is 0', () => {
    const rect = createRectangle(0, 0, 50, 50);
    const clip = createClipRegionFromRoundedRectangle(rect, 0);
    expect(clip.contours).toBeNull();
  });
});

describe('getClipRegionBounds', () => {
  it('copies the clip rect into the out rectangle', () => {
    const clip = createClipRegionFromRectangle(createRectangle(3, 4, 15, 25));
    const out = createRectangle();
    getClipRegionBounds(out, clip);
    expect(out.x).toBe(3);
    expect(out.y).toBe(4);
    expect(out.width).toBe(15);
    expect(out.height).toBe(25);
  });
});

describe('intersectClipRegions', () => {
  it('produces a scissor-eligible rect when both inputs are rectangular', () => {
    const a = createClipRegionFromRectangle(createRectangle(0, 0, 20, 20));
    const b = createClipRegionFromRectangle(createRectangle(10, 10, 20, 20));
    const out = createClipRegionFromRectangle(createRectangle(0, 0, 1, 1));
    intersectClipRegions(out, a, b);
    expect(out.contours).toBeNull();
    expect(out.rect.x).toBe(10);
    expect(out.rect.y).toBe(10);
    expect(out.rect.width).toBe(10);
    expect(out.rect.height).toBe(10);
    expect(out.version).toBe(1);
  });

  it('produces an empty region for disjoint inputs', () => {
    const a = createClipRegionFromRectangle(createRectangle(0, 0, 10, 10));
    const b = createClipRegionFromRectangle(createRectangle(20, 20, 10, 10));
    const out = createClipRegionFromRectangle(createRectangle(0, 0, 1, 1));
    intersectClipRegions(out, a, b);
    expect(isClipRegionEmpty(out)).toBe(true);
    expect(out.contours).toBeNull();
  });

  it('is alias-safe when out === a', () => {
    const out = createClipRegionFromRectangle(createRectangle(0, 0, 20, 20));
    const b = createClipRegionFromRectangle(createRectangle(10, 10, 20, 20));
    intersectClipRegions(out, out, b);
    expect(out.rect.x).toBe(10);
    expect(out.rect.y).toBe(10);
    expect(out.rect.width).toBe(10);
    expect(out.rect.height).toBe(10);
  });

  it('is alias-safe when out === b', () => {
    const a = createClipRegionFromRectangle(createRectangle(0, 0, 20, 20));
    const out = createClipRegionFromRectangle(createRectangle(10, 10, 20, 20));
    intersectClipRegions(out, a, out);
    expect(out.rect.x).toBe(10);
    expect(out.rect.y).toBe(10);
    expect(out.rect.width).toBe(10);
    expect(out.rect.height).toBe(10);
  });

  it('keeps contours when one input is a contour form', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 20, 0);
    appendPathLineTo(path, 20, 20);
    appendPathLineTo(path, 0, 20);
    const contourClip = createClipRegionFromPath(path);
    const rectClip = createClipRegionFromRectangle(createRectangle(10, 10, 20, 20));
    const out = createClipRegionFromRectangle(createRectangle(0, 0, 1, 1));
    intersectClipRegions(out, contourClip, rectClip);
    expect(out.contours).not.toBeNull();
  });
});

describe('invalidateClipRegion', () => {
  it('increments the version and wraps with >>> 0', () => {
    const clip = createClipRegionFromRectangle(createRectangle(0, 0, 1, 1));
    invalidateClipRegion(clip);
    expect(clip.version).toBe(1);
    clip.version = 0xffffffff;
    invalidateClipRegion(clip);
    expect(clip.version).toBe(0);
  });
});

describe('isClipRegionEmpty', () => {
  it('returns true for a zero-size rectangular clip', () => {
    const clip = createClipRegionFromRectangle(createRectangle(0, 0, 0, 0));
    expect(isClipRegionEmpty(clip)).toBe(true);
  });

  it('returns false for a non-empty rectangular clip', () => {
    const clip = createClipRegionFromRectangle(createRectangle(0, 0, 10, 10));
    expect(isClipRegionEmpty(clip)).toBe(false);
  });

  it('returns true for a contour clip with no contours', () => {
    const clip = createClipRegionFromContours([], 'nonZero');
    expect(isClipRegionEmpty(clip)).toBe(true);
  });
});

describe('isClipRegionRectangular', () => {
  it('returns true for a rectangular clip', () => {
    const clip = createClipRegionFromRectangle(createRectangle(0, 0, 10, 10));
    expect(isClipRegionRectangular(clip)).toBe(true);
  });

  it('returns false for a path clip', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 10, 0);
    appendPathLineTo(path, 10, 10);
    const clip = createClipRegionFromPath(path);
    expect(isClipRegionRectangular(clip)).toBe(false);
  });
});

describe('normalizeClipRegion', () => {
  it('copies a rectangular clip unchanged and bumps version', () => {
    const clip = createClipRegionFromRectangle(createRectangle(5, 10, 20, 30));
    const out = createClipRegionFromRectangle(createRectangle(0, 0, 1, 1));
    normalizeClipRegion(out, clip);
    expect(out.contours).toBeNull();
    expect(out.rect.x).toBe(5);
    expect(out.rect.y).toBe(10);
    expect(out.rect.width).toBe(20);
    expect(out.rect.height).toBe(30);
    expect(out.version).toBe(1);
  });

  it('promotes a 4-point axis-aligned quad contour back to rect form', () => {
    // 4-corner axis-aligned rectangle stored as contours (e.g. from transformClipRegion with identity)
    const contours = [[0, 0, 10, 0, 10, 10, 0, 10]];
    const clip = createClipRegionFromContours(contours, 'nonZero');
    expect(clip.contours).not.toBeNull();

    const out = createClipRegionFromRectangle(createRectangle(0, 0, 1, 1));
    normalizeClipRegion(out, clip);

    expect(out.contours).toBeNull();
    expect(out.rect.x).toBeCloseTo(0);
    expect(out.rect.y).toBeCloseTo(0);
    expect(out.rect.width).toBeCloseTo(10);
    expect(out.rect.height).toBeCloseTo(10);
  });

  it('preserves contours that are not axis-aligned rectangles', () => {
    // Triangle: 3 points (6 coords) — not a rectangle.
    const contours = [[0, 0, 10, 0, 5, 10]];
    const clip = createClipRegionFromContours(contours, 'nonZero');
    const out = createClipRegionFromRectangle(createRectangle(0, 0, 1, 1));
    normalizeClipRegion(out, clip);
    expect(out.contours).not.toBeNull();
  });

  it('preserves contours when more than one sub-path is present', () => {
    const contours = [
      [0, 0, 10, 0, 10, 10, 0, 10],
      [20, 20, 30, 20, 30, 30, 20, 30],
    ];
    const clip = createClipRegionFromContours(contours, 'nonZero');
    const out = createClipRegionFromRectangle(createRectangle(0, 0, 1, 1));
    normalizeClipRegion(out, clip);
    // Two contours → cannot detect as a simple rect.
    expect(out.contours).not.toBeNull();
  });

  it('normalizes a quad produced by transformClipRegion with a 90-degree rotation back to rect', () => {
    // A 10x10 rect rotated 90 degrees produces a quad with corners at exactly axis-aligned positions.
    const clip = createClipRegionFromRectangle(createRectangle(0, 0, 10, 10));
    const rotated = createClipRegionFromRectangle(createRectangle(0, 0, 1, 1));
    const matrix = { a: 0, b: 1, c: -1, d: 0, tx: 10, ty: 0 }; // 90-degree rotation
    transformClipRegion(rotated, clip, matrix);
    expect(rotated.contours).not.toBeNull();

    const out = createClipRegionFromRectangle(createRectangle(0, 0, 1, 1));
    normalizeClipRegion(out, rotated);
    // A 90-degree-rotated rectangle remains an axis-aligned rectangle, so it normalizes.
    expect(out.contours).toBeNull();
  });
});

describe('releaseClipRegion', () => {
  it('returns a region to the pool for reuse', () => {
    const clip = acquireClipRegion();
    releaseClipRegion(clip);
    const reused = acquireClipRegion();
    expect(reused).toBe(clip);
    releaseClipRegion(reused);
  });
});

describe('setClipRegionToRectangle', () => {
  it('retargets a contour clip to a rectangle form and bumps version', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 10, 0);
    appendPathLineTo(path, 10, 10);
    const clip = createClipRegionFromPath(path);
    setClipRegionToRectangle(clip, createRectangle(5, 5, 20, 30));
    expect(clip.contours).toBeNull();
    expect(clip.rect.x).toBe(5);
    expect(clip.rect.y).toBe(5);
    expect(clip.rect.width).toBe(20);
    expect(clip.rect.height).toBe(30);
    expect(clip.version).toBe(1);
  });
});

describe('transformClipRegion', () => {
  it('keeps a rectangular clip scissor-eligible for axis-aligned transforms', () => {
    const clip = createClipRegionFromRectangle(createRectangle(0, 0, 10, 10));
    const out = createClipRegionFromRectangle(createRectangle(0, 0, 1, 1));
    // Scale by 2, translate by 5, 5
    const matrix = createMatrix(2, 0, 0, 2, 5, 5);
    transformClipRegion(out, clip, matrix);
    expect(out.contours).toBeNull();
    expect(out.rect.x).toBeCloseTo(5);
    expect(out.rect.y).toBeCloseTo(5);
    expect(out.rect.width).toBeCloseTo(20);
    expect(out.rect.height).toBeCloseTo(20);
    expect(out.version).toBe(1);
  });

  it('promotes a rectangle to a quad contour when the matrix rotates', () => {
    const clip = createClipRegionFromRectangle(createRectangle(0, 0, 10, 10));
    const out = createClipRegionFromRectangle(createRectangle(0, 0, 1, 1));
    // 45 degree rotation matrix
    const cos45 = Math.cos(Math.PI / 4);
    const sin45 = Math.sin(Math.PI / 4);
    const matrix = createMatrix(cos45, sin45, -sin45, cos45, 0, 0);
    transformClipRegion(out, clip, matrix);
    expect(out.contours).not.toBeNull();
    expect(out.contours!.length).toBe(1);
    expect(out.contours![0].length).toBe(8); // 4 corner pairs
  });

  it('transforms contour points correctly', () => {
    const contours = [[0, 0, 10, 0, 10, 10, 0, 10]];
    const clip = createClipRegionFromContours(contours, 'nonZero');
    const out = createClipRegionFromRectangle(createRectangle(0, 0, 1, 1));
    // Translate by 5, 5
    const matrix = createMatrix(1, 0, 0, 1, 5, 5);
    transformClipRegion(out, clip, matrix);
    expect(out.contours).not.toBeNull();
    expect(out.rect.x).toBeCloseTo(5);
    expect(out.rect.y).toBeCloseTo(5);
    expect(out.rect.width).toBeCloseTo(10);
    expect(out.rect.height).toBeCloseTo(10);
  });

  it('is alias-safe when out === clip (rect form, axis-aligned)', () => {
    const clip = createClipRegionFromRectangle(createRectangle(0, 0, 10, 10));
    const matrix = createMatrix(1, 0, 0, 1, 5, 5);
    transformClipRegion(clip, clip, matrix);
    expect(clip.rect.x).toBeCloseTo(5);
    expect(clip.rect.y).toBeCloseTo(5);
  });
});

describe('unionClipRegions', () => {
  it('produces the bounding union of two rectangular clips', () => {
    const a = createClipRegionFromRectangle(createRectangle(0, 0, 10, 10));
    const b = createClipRegionFromRectangle(createRectangle(5, 5, 15, 15));
    const out = createClipRegionFromRectangle(createRectangle(0, 0, 1, 1));
    unionClipRegions(out, a, b);
    expect(out.contours).toBeNull();
    expect(out.rect.x).toBe(0);
    expect(out.rect.y).toBe(0);
    expect(out.rect.width).toBe(20);
    expect(out.rect.height).toBe(20);
    expect(out.version).toBe(1);
  });

  it('preserves contours from the richer input', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 10, 0);
    appendPathLineTo(path, 10, 10);
    appendPathLineTo(path, 0, 10);
    const contourClip = createClipRegionFromPath(path);
    const rectClip = createClipRegionFromRectangle(createRectangle(5, 5, 20, 20));
    const out = createClipRegionFromRectangle(createRectangle(0, 0, 1, 1));
    unionClipRegions(out, contourClip, rectClip);
    expect(out.contours).not.toBeNull();
  });
});
