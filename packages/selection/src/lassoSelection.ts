// Generated from crates/flight-selection/src/lasso_selection.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';
import { getNodeLocalBoundsRectangle } from '@flighthq/node/contract';
import type { NodeRef } from '@flighthq/node/contract';
import type { Path } from '@flighthq/path/contract';

import {
  appendLassoClose,
  appendLassoLineTo,
  appendLassoMoveTo,
  clearLassoPath,
  createLassoPath,
} from './pathCompat.ts';
import type { LassoSelectionRaw } from './types.ts';
import { lassoSelectionStateStore } from './types.ts';

export function addLassoSelectionPointCore(selection: LassoSelectionRaw, x: number, y: number): void {
  if (!lassoSelectionStateStore.get(selection)!.active) {
    return;
  }
  appendLassoLineTo(lassoSelectionStateStore.get(selection)!.path, x, y);
}

export function beginLassoSelectionCore(selection: LassoSelectionRaw, startX: number, startY: number): void {
  lassoSelectionStateStore.get(selection)!.active = true;
  clearLassoPath(lassoSelectionStateStore.get(selection)!.path);
  appendLassoMoveTo(lassoSelectionStateStore.get(selection)!.path, startX, startY);
}

export function createLassoSelectionCore(): LassoSelectionRaw {
  let out: LassoSelectionRaw = allocateEntity<LassoSelectionRaw>();
  initializeLassoSelectionCore(out);
  return out;
}

export function endLassoSelectionCore(selection: LassoSelectionRaw): Readonly<Path> {
  if (lassoSelectionStateStore.get(selection)!.active) {
    appendLassoClose(lassoSelectionStateStore.get(selection)!.path);
  }
  lassoSelectionStateStore.get(selection)!.active = false;
  return lassoSelectionStateStore.get(selection)!.path;
}

export function findNodesInLassoSelectionInto(
  out: NodeRef[],
  selection: Readonly<LassoSelectionRaw>,
  candidates: Readonly<NodeRef[]>,
): void {
  out.length = 0;
  if (lassoSelectionStateStore.get(selection)!.path.data.length < 6) {
    return;
  }
  for (const candidate of candidates) {
    const bounds = getNodeLocalBoundsRectangle(candidate);
    const centerX = bounds.x + bounds.width / 2.0;
    const centerY = bounds.y + bounds.height / 2.0;
    if (isPointInPolygon(lassoSelectionStateStore.get(selection)!.path.data, centerX, centerY)) {
      out.push(candidate);
    }
  }
}

export function getLassoSelectionPathCore(selection: Readonly<LassoSelectionRaw>): Readonly<Path> {
  return lassoSelectionStateStore.get(selection)!.path;
}

export function initializeLassoSelectionCore(out: LassoSelectionRaw): void {
  lassoSelectionStateStore.set(out, { active: false, path: createLassoPath() });
}

function isPointInPolygon(points: Readonly<number[]>, x: number, y: number): boolean {
  let inside = false;
  const pointCount = Math.trunc(points.length / 2);
  let previousIndex = pointCount - 1;
  for (let currentIndex = 0; currentIndex < pointCount; currentIndex += 1) {
    const currentX = points[currentIndex * 2];
    const currentY = points[currentIndex * 2 + 1];
    const previousX = points[previousIndex * 2];
    const previousY = points[previousIndex * 2 + 1];
    if (isPointOnSegment(x, y, previousX, previousY, currentX, currentY)) {
      return true;
    }
    if (
      currentY > y !== previousY > y &&
      x < ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX
    ) {
      inside = !inside;
    }
    previousIndex = currentIndex;
  }
  return inside;
}

function isPointOnSegment(x: number, y: number, startX: number, startY: number, endX: number, endY: number): boolean {
  const cross = (x - startX) * (endY - startY) - (y - startY) * (endX - startX);
  const scale = Math.max(Math.max(1.0, Math.abs(endX - startX)), Math.abs(endY - startY));
  if (Math.abs(cross) > Number.EPSILON * scale * 16.0) {
    return false;
  }
  return (
    x >= Math.min(startX, endX) &&
    x <= Math.max(startX, endX) &&
    y >= Math.min(startY, endY) &&
    y <= Math.max(startY, endY)
  );
}
