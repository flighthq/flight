// Generated from crates/flight-clip/src/clip_region.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction } from '@flighthq/entity/contract';
import {
  cloneRectangle,
  containsRectanglePointXY,
  copyRectangle,
  createRectangle,
  enclosesRectangle,
  intersectsRectangle,
  isEmptyRectangle,
  matrixTransformRectangle,
  mergeRectangle,
} from '@flighthq/geometry/contract';
import type { MatrixLike, Rectangle, RectangleLike } from '@flighthq/geometry/contract';

import {
  acquireClipRegionFromPool,
  getClipRegionContoursGuard,
  isClipRegionReleased,
  releaseClipRegionToPool,
  setClipRegionContoursGuardSlot,
  setClipRegionReleaseGuardSlot,
  setClipRegionUseGuardSlot,
  snapshotClipRegionReleaseGuard,
  snapshotClipRegionUseGuard,
} from './clipRegionRuntime.ts';
import type {
  ClipRegion,
  ClipRegionContoursExplanation,
  ClipRegionContoursGuard,
  ClipRegionExplanation,
  ClipRegionReleaseGuard,
  ClipRegionUseGuard,
  PathWinding,
} from './types.ts';

const NORMALIZE_EPSILON: number = 1e-6;

export function acquireClipRegion(): ClipRegion {
  const region = acquireClipRegionFromPool();
  if (region !== null) {
    const pooledRegion = region;
    resetClipRegion(pooledRegion);
    return pooledRegion;
  }
  return createEmptyClipRegion();
}

export function clipRegionContainsClipRegion(a: ClipRegion, b: ClipRegion): boolean {
  guardClipRegionUse(a);
  guardClipRegionUse(b);
  const aRect = a!.rect;
  const bRect = b!.rect;
  return enclosesRectangle(aRect, bRect);
}

function createEmptyClipRegion(): ClipRegion {
  let out: ClipRegion = allocateEntity<ClipRegion>();
  out.rect = createRectangle(0.0, 0.0, 0.0, 0.0);
  out.contours = null;
  out.winding = 'nonZero';
  out.version = 0;
  return out;
}

export function clipRegionContainsPoint(clip: ClipRegion, x: number, y: number): boolean {
  guardClipRegionUse(clip);
  clip = clip!;
  if (!containsRectanglePointXY(clip.rect, x, y)) {
    return false;
  }
  if (clip.contours !== null) {
    const contours = clip.contours;
    return pointInContours(contours, clip.winding, x, y);
  }
  return true;
}

export function clipRegionContainsRectangle(clip: ClipRegion, rectangle: Readonly<RectangleLike>): boolean {
  guardClipRegionUse(clip);
  return enclosesRectangle(clip!.rect, rectangle);
}

export function clipRegionIntersectsClipRegion(a: ClipRegion, b: ClipRegion): boolean {
  guardClipRegionUse(a);
  guardClipRegionUse(b);
  const aRect = a!.rect;
  const bRect = b!.rect;
  return intersectsRectangle(aRect, bRect);
}

function callClipRegionContoursGuard(
  explanation: ClipRegionContoursExplanation | null,
  guard: ClipRegionContoursGuard | null,
  contours: Readonly<number[][]>,
): void {
  const issue = explanation;
  if (issue === null) {
    return;
  }
  const installedGuard = guard;
  if (installedGuard === null) {
    return;
  }
  installedGuard(issue, contours);
}

export function clipRegionIntersectsRectangle(clip: ClipRegion, rectangle: Readonly<RectangleLike>): boolean {
  guardClipRegionUse(clip);
  return intersectsRectangle(clip!.rect, rectangle);
}

export function cloneClipRegion(clip: ClipRegion): ClipRegion {
  guardClipRegionUse(clip);
  clip = clip!;
  let out: ClipRegion = allocateEntity<ClipRegion>();
  out.rect = cloneRectangle(clip.rect);
  out.contours = cloneClipRegionContours(clip.contours);
  out.winding = clip.winding;
  out.version = clip.version;
  return out;
}

export function copyClipRegion(out: ClipRegion, source: ClipRegion): void {
  guardClipRegionUse(out);
  guardClipRegionUse(source);
  if (out === source) {
    return;
  }
  const [rect, contours, winding] = snapshotClipRegion(source);
  out = out!;
  const mutableOut: EntityConstruction<ClipRegion> = out;
  copyRectangle(mutableOut.rect, rect);
  mutableOut.contours = contours;
  mutableOut.winding = winding;
  mutableOut.version = (mutableOut.version + 1) >>> 0;
}

export function createClipRegionFromContours(contours: Readonly<number[][]>, winding: PathWinding): ClipRegion {
  let out: ClipRegion = allocateEntity<ClipRegion>();
  initializeClipRegionFromContours(out, contours, winding);
  return out;
}

export function createClipRegionFromRectangle(rectangle: Readonly<RectangleLike>): ClipRegion {
  let out: ClipRegion = allocateEntity<ClipRegion>();
  initializeClipRegionFromRectangle(out, rectangle);
  return out;
}

export function equalsClipRegion(a: ClipRegion, b: ClipRegion): boolean {
  guardClipRegionUse(a);
  guardClipRegionUse(b);
  if (a === b) {
    return true;
  }
  a = a!;
  b = b!;
  return (
    a.winding === b.winding &&
    equalClipRegionRectangles(a.rect, b.rect) &&
    equalClipRegionContours(a.contours, b.contours)
  );
}

function cloneClipRegionContours(contours: Readonly<number[][] | null>): number[][] | null {
  if (contours !== null) {
    const sourceContours = contours;
    return copyClipRegionContours(sourceContours);
  }
  return null;
}

export function explainClipRegion(clip: ClipRegion): ClipRegionExplanation {
  const conservative = clip!.contours !== null;
  const released = isClipRegionReleased(clip);
  return { conservative: conservative, status: released ? 'released' : 'active' };
}

function copyClipRegionContours(contours: Readonly<number[][]>): number[][] {
  let out: number[][] = [] as never[];
  for (const contour of contours) {
    out.push([...contour]);
  }
  return out;
}

function equalClipRegionContours(a: Readonly<number[][] | null>, b: Readonly<number[][] | null>): boolean {
  if (a !== null) {
    const aValues = a;
    const bValues = b;
    if (bValues === null) {
      return false;
    }
    if (aValues.length !== bValues.length) {
      return false;
    }
    for (let contourIndex = 0; contourIndex < aValues.length; contourIndex += 1) {
      const aContour = aValues[contourIndex];
      const bContour = bValues[contourIndex];
      if (aContour.length !== bContour.length) {
        return false;
      }
      for (let coordinateIndex = 0; coordinateIndex < aContour.length; coordinateIndex += 1) {
        if (aContour[coordinateIndex] !== bContour[coordinateIndex]) {
          return false;
        }
      }
    }
    return true;
  }
  return b === null;
}

function equalClipRegionRectangles(a: Readonly<Rectangle>, b: Readonly<Rectangle>): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function explainClipRegionContours(contours: Readonly<number[][]>): ClipRegionContoursExplanation | null {
  for (let contourIndex = 0; contourIndex < contours.length; contourIndex += 1) {
    const contour = contours[contourIndex];
    const coordinateCount = contour.length;
    if ((coordinateCount & 1) !== 0) {
      return { contourIndex: contourIndex, coordinateCount: coordinateCount, reason: 'odd-coordinate-count' };
    }
    if (coordinateCount < 6) {
      return { contourIndex: contourIndex, coordinateCount: coordinateCount, reason: 'too-few-points' };
    }
  }
  return null;
}

export function getClipRegionBounds(out: RectangleLike, clip: ClipRegion): void {
  guardClipRegionUse(clip);
  copyRectangle(out, clip!.rect);
}

export function initializeClipRegionFromContours(
  out: ClipRegion,
  contours: Readonly<number[][]>,
  winding: PathWinding,
): void {
  const explanation = explainClipRegionContours(contours);
  const guard = getClipRegionContoursGuard();
  callClipRegionContoursGuard(explanation, guard, contours);
  out.rect = createRectangle(0.0, 0.0, 0.0, 0.0);
  setRectangleToContoursBounds(out.rect, contours);
  out.contours = copyClipRegionContours(contours);
  out.version = 0;
  out.winding = winding;
}

export function initializeClipRegionFromRectangle(out: ClipRegion, rectangle: Readonly<RectangleLike>): void {
  out.rect = cloneRectangle(rectangle);
  out.contours = null;
  out.version = 0;
  out.winding = 'nonZero';
}

function guardClipRegionUse(clip: ClipRegion): void {
  const [guard, released] = snapshotClipRegionUseGuard(clip);
  const installedGuard = guard;
  if (installedGuard === null) {
    return;
  }
  if (released) {
    installedGuard(clip);
  }
}

export function intersectClipRegions(out: ClipRegion, a: ClipRegion, b: ClipRegion): void {
  guardClipRegionUse(out);
  guardClipRegionUse(a);
  guardClipRegionUse(b);
  const [aRect, aContours, aWinding] = snapshotClipRegion(a);
  const [bRect, bContours, bWinding] = snapshotClipRegion(b);
  const x0 = Math.max(aRect.x, bRect.x);
  const y0 = Math.max(aRect.y, bRect.y);
  const x1 = Math.min(aRect.x + aRect.width, bRect.x + bRect.width);
  const y1 = Math.min(aRect.y + aRect.height, bRect.y + bRect.height);
  out = out!;
  const mutableOut: EntityConstruction<ClipRegion> = out;
  if (x1 <= x0 || y1 <= y0) {
    mutableOut.rect.x = 0.0;
    mutableOut.rect.y = 0.0;
    mutableOut.rect.width = 0.0;
    mutableOut.rect.height = 0.0;
    mutableOut.contours = null;
    mutableOut.winding = 'nonZero';
    mutableOut.version = (mutableOut.version + 1) >>> 0;
    return;
  }
  mutableOut.rect.x = x0;
  mutableOut.rect.y = y0;
  mutableOut.rect.width = x1 - x0;
  mutableOut.rect.height = y1 - y0;
  const [contours, winding] = selectContours(aContours, aWinding, bContours, bWinding);
  mutableOut.contours = contours;
  mutableOut.winding = winding;
  mutableOut.version = (mutableOut.version + 1) >>> 0;
}

export function invalidateClipRegion(clip: ClipRegion): void {
  guardClipRegionUse(clip);
  clip = clip!;
  const mutableClip: EntityConstruction<ClipRegion> = clip;
  mutableClip.version = (mutableClip.version + 1) >>> 0;
}

export function isClipRegionEmpty(clip: ClipRegion): boolean {
  guardClipRegionUse(clip);
  clip = clip!;
  if (isEmptyRectangle(clip.rect)) {
    return true;
  }
  if (clip.contours !== null) {
    const contours = clip.contours;
    return contours.length === 0;
  }
  return false;
}

export function isClipRegionRectangular(clip: ClipRegion): boolean {
  guardClipRegionUse(clip);
  return clip!.contours === null;
}

export function normalizeClipRegion(out: ClipRegion, clip: ClipRegion): void {
  guardClipRegionUse(out);
  guardClipRegionUse(clip);
  const [rect, contours, winding] = snapshotClipRegion(clip);
  const normalized = normalizedClipRegionBounds(contours);
  out = out!;
  const mutableOut: EntityConstruction<ClipRegion> = out;
  if (normalized !== null) {
    const bounds = normalized;
    mutableOut.rect.x = bounds[0];
    mutableOut.rect.y = bounds[1];
    mutableOut.rect.width = bounds[2] - bounds[0];
    mutableOut.rect.height = bounds[3] - bounds[1];
    mutableOut.contours = null;
    mutableOut.winding = 'nonZero';
  } else {
    copyRectangle(mutableOut.rect, rect);
    mutableOut.contours = contours;
    mutableOut.winding = winding;
  }
  mutableOut.version = (mutableOut.version + 1) >>> 0;
}

function normalizedClipRegionBounds(contours: Readonly<number[][] | null>): number[] | null {
  const sourceContours = contours;
  if (sourceContours === null) {
    return null;
  }
  if (sourceContours.length !== 1 || sourceContours[0].length !== 8) {
    return null;
  }
  const contour = sourceContours[0];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let index = 0;
  while (index < contour.length) {
    minX = Math.min(minX, contour[index]);
    minY = Math.min(minY, contour[index + 1]);
    maxX = Math.max(maxX, contour[index]);
    maxY = Math.max(maxY, contour[index + 1]);
    index += 2;
  }
  let axisAligned = true;
  index = 0;
  while (index < contour.length) {
    const x = contour[index];
    const y = contour[index + 1];
    if (
      !(
        (Math.abs(x - minX) <= NORMALIZE_EPSILON || Math.abs(x - maxX) <= NORMALIZE_EPSILON) &&
        (Math.abs(y - minY) <= NORMALIZE_EPSILON || Math.abs(y - maxY) <= NORMALIZE_EPSILON)
      )
    ) {
      axisAligned = false;
    }
    index += 2;
  }
  if (axisAligned) {
    return [minX, minY, maxX, maxY];
  }
  return null;
}

function pointInContours(contours: Readonly<number[][]>, winding: PathWinding, px: number, py: number): boolean {
  let windingNumber = 0;
  for (const contour of contours) {
    const count = contour.length;
    if (count < 6 || count % 2 !== 0) {
      continue;
    }
    let index = 0;
    while (index < count) {
      const x0 = contour[index];
      const y0 = contour[index + 1];
      const x1 = contour[(index + 2) % count];
      const y1 = contour[(index + 3) % count];
      const side = (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0);
      if (y0 <= py && y1 > py && side > 0.0) {
        windingNumber += 1;
      } else {
        if (y0 > py && y1 <= py && side < 0.0) {
          windingNumber -= 1;
        }
      }
      index += 2;
    }
  }
  if (winding === 'evenOdd') {
    return (windingNumber & 1) !== 0;
  }
  return windingNumber !== 0;
}

export function releaseClipRegion(clip: ClipRegion): void {
  const [guard, released] = snapshotClipRegionReleaseGuard(clip);
  if (!released) {
    releaseClipRegionToPool(clip);
    return;
  }
  if (guard !== null) {
    const installedGuard = guard;
    installedGuard(clip);
  }
  releaseClipRegionToPool(clip);
}

function resetClipRegion(region: ClipRegion): void {
  region = region!;
  const mutableRegion: EntityConstruction<ClipRegion> = region;
  mutableRegion.rect.x = 0.0;
  mutableRegion.rect.y = 0.0;
  mutableRegion.rect.width = 0.0;
  mutableRegion.rect.height = 0.0;
  mutableRegion.contours = null;
  mutableRegion.winding = 'nonZero';
  mutableRegion.version = 0;
}

function selectContours(
  aContours: number[][] | null,
  aWinding: PathWinding,
  bContours: number[][] | null,
  bWinding: PathWinding,
): readonly [number[][] | null, PathWinding] {
  if (aContours !== null) {
    const aValues = aContours;
    if (bContours !== null) {
      const bValues = bContours;
      if (aValues.length >= bValues.length) {
        return [aValues, aWinding];
      }
      return [bValues, bWinding];
    }
    return [aValues, aWinding];
  }
  if (bContours !== null) {
    const bValues = bContours;
    return [bValues, bWinding];
  }
  return [null, 'nonZero'];
}

export function setClipRegionContoursGuard(guard: ClipRegionContoursGuard | null): void {
  setClipRegionContoursGuardSlot(guard);
}

export function setClipRegionReleaseGuard(guard: ClipRegionReleaseGuard | null): void {
  setClipRegionReleaseGuardSlot(guard);
}

export function setClipRegionToContours(out: ClipRegion, contours: Readonly<number[][]>, winding: PathWinding): void {
  guardClipRegionUse(out);
  const explanation = explainClipRegionContours(contours);
  const guard = getClipRegionContoursGuard();
  callClipRegionContoursGuard(explanation, guard, contours);
  out = out!;
  const mutableOut: EntityConstruction<ClipRegion> = out;
  setRectangleToContoursBounds(mutableOut.rect, contours);
  mutableOut.contours = copyClipRegionContours(contours);
  mutableOut.winding = winding;
  mutableOut.version = (mutableOut.version + 1) >>> 0;
}

export function setClipRegionToRectangle(out: ClipRegion, rectangle: Readonly<RectangleLike>): void {
  guardClipRegionUse(out);
  out = out!;
  const mutableOut: EntityConstruction<ClipRegion> = out;
  mutableOut.rect = cloneRectangle(rectangle);
  mutableOut.contours = null;
  mutableOut.winding = 'nonZero';
  mutableOut.version = (mutableOut.version + 1) >>> 0;
}

export function setClipRegionUseGuard(guard: ClipRegionUseGuard | null): void {
  setClipRegionUseGuardSlot(guard);
}

function setRectangleToContoursBounds(out: Rectangle, contours: Readonly<number[][]>): void {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const contour of contours) {
    if (contour.length < 6 || contour.length % 2 !== 0) {
      continue;
    }
    let index = 0;
    while (index < contour.length) {
      minX = Math.min(minX, contour[index]);
      minY = Math.min(minY, contour[index + 1]);
      maxX = Math.max(maxX, contour[index]);
      maxY = Math.max(maxY, contour[index + 1]);
      index += 2;
    }
  }
  if (minX > maxX) {
    out.x = 0.0;
    out.y = 0.0;
    out.width = 0.0;
    out.height = 0.0;
    return;
  }
  out.x = minX;
  out.y = minY;
  out.width = maxX - minX;
  out.height = maxY - minY;
}

function snapshotClipRegion(clip: ClipRegion): readonly [Rectangle, number[][] | null, PathWinding] {
  clip = clip!;
  return [cloneRectangle(clip.rect), cloneClipRegionContours(clip.contours), clip.winding];
}

export function transformClipRegion(out: ClipRegion, clip: ClipRegion, matrix: Readonly<MatrixLike>): void {
  guardClipRegionUse(out);
  guardClipRegionUse(clip);
  const [rect, contours, winding] = snapshotClipRegion(clip);
  out = out!;
  const mutableOut: EntityConstruction<ClipRegion> = out;
  if (contours !== null) {
    const sourceContours = contours;
    const a = matrix.a;
    const b = matrix.b;
    const c = matrix.c;
    const d = matrix.d;
    const tx = matrix.tx;
    const ty = matrix.ty;
    let transformed: number[][] = [] as never[];
    for (const contour of sourceContours) {
      let transformedContour: number[] = [] as never[];
      let index = 0;
      while (index < contour.length) {
        const x = contour[index];
        const y = contour[index + 1];
        transformedContour.push(a * x + c * y + tx);
        transformedContour.push(b * x + d * y + ty);
        index += 2;
      }
      transformed.push(transformedContour);
    }
    setRectangleToContoursBounds(mutableOut.rect, transformed);
    mutableOut.contours = transformed;
    mutableOut.winding = winding;
  } else {
    if (matrix.b === 0.0 && matrix.c === 0.0) {
      matrixTransformRectangle(mutableOut.rect, matrix, rect);
      mutableOut.contours = null;
      mutableOut.winding = 'nonZero';
    } else {
      const a = matrix.a;
      const b = matrix.b;
      const c = matrix.c;
      const d = matrix.d;
      const tx = matrix.tx;
      const ty = matrix.ty;
      const x = rect.x;
      const y = rect.y;
      const width = rect.width;
      const height = rect.height;
      const quad = [
        a * x + c * y + tx,
        b * x + d * y + ty,
        a * (x + width) + c * y + tx,
        b * (x + width) + d * y + ty,
        a * (x + width) + c * (y + height) + tx,
        b * (x + width) + d * (y + height) + ty,
        a * x + c * (y + height) + tx,
        b * x + d * (y + height) + ty,
      ];
      const contours = [quad];
      setRectangleToContoursBounds(mutableOut.rect, contours);
      mutableOut.contours = contours;
      mutableOut.winding = 'nonZero';
    }
  }
  mutableOut.version = (mutableOut.version + 1) >>> 0;
}

export function unionClipRegions(out: ClipRegion, a: ClipRegion, b: ClipRegion): void {
  guardClipRegionUse(out);
  guardClipRegionUse(a);
  guardClipRegionUse(b);
  const [aRect, aContours, aWinding] = snapshotClipRegion(a);
  const [bRect, bContours, bWinding] = snapshotClipRegion(b);
  out = out!;
  const mutableOut: EntityConstruction<ClipRegion> = out;
  mergeRectangle(mutableOut.rect, aRect, bRect);
  const [contours, winding] = selectContours(aContours, aWinding, bContours, bWinding);
  mutableOut.contours = contours;
  mutableOut.winding = winding;
  mutableOut.version = (mutableOut.version + 1) >>> 0;
}
