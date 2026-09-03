import { createEntity } from '@flighthq/entity/contract';
import { getNodeLocalBoundsRectangle } from '@flighthq/node/contract';
import type { BoundsNodeAny, LassoSelection, LassoSelectionRuntime, Path } from '@flighthq/types/contract';
import { EntityRuntimeKey, PathCommand } from '@flighthq/types/contract';

export function addLassoSelectionPoint(selection: LassoSelection, x: number, y: number): void {
  const runtime = getLassoSelectionRuntime(selection);
  if (!runtime.active) return;
  runtime.path.commands.push(PathCommand.LINE_TO);
  runtime.path.data.push(x, y);
}

export function beginLassoSelection(selection: LassoSelection, startX: number, startY: number): void {
  const runtime = getLassoSelectionRuntime(selection);
  runtime.active = true;
  runtime.path.commands.length = 0;
  runtime.path.data.length = 0;
  runtime.path.commands.push(PathCommand.MOVE_TO);
  runtime.path.data.push(startX, startY);
}

export function createLassoSelection(): LassoSelection {
  const selection = { [EntityRuntimeKey]: undefined } as LassoSelection;
  const runtime = {
    active: false,
    binding: null,
    path: createEntity({ commands: [] as number[], data: [] as number[], winding: 'evenOdd' as const }),
  } satisfies LassoSelectionRuntime;
  selection[EntityRuntimeKey] = runtime;
  return selection;
}

export function endLassoSelection(selection: LassoSelection): Path {
  const runtime = getLassoSelectionRuntime(selection);
  if (runtime.active) runtime.path.commands.push(PathCommand.CLOSE);
  runtime.active = false;
  return runtime.path;
}

export function findNodesInLassoSelection<NodeType extends BoundsNodeAny>(
  selection: Readonly<LassoSelection>,
  candidates: readonly NodeType[],
): NodeType[] {
  const path = getLassoSelectionRuntime(selection).path;
  if (path.data.length < 6) return [];

  const matches: NodeType[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const bounds = getNodeLocalBoundsRectangle(candidate);
    if (isPointInPolygon(path.data, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)) {
      matches.push(candidate);
    }
  }
  return matches;
}

export function getLassoSelectionPath(selection: Readonly<LassoSelection>): Readonly<Path> {
  return getLassoSelectionRuntime(selection).path;
}

function getLassoSelectionRuntime(selection: Readonly<LassoSelection>): LassoSelectionRuntime {
  return selection[EntityRuntimeKey] as LassoSelectionRuntime;
}

function isPointInPolygon(points: readonly number[], x: number, y: number): boolean {
  let inside = false;
  const pointCount = points.length / 2;
  let previousIndex = pointCount - 1;
  for (let currentIndex = 0; currentIndex < pointCount; currentIndex++) {
    const currentX = points[currentIndex * 2];
    const currentY = points[currentIndex * 2 + 1];
    const previousX = points[previousIndex * 2];
    const previousY = points[previousIndex * 2 + 1];

    if (isPointOnSegment(x, y, previousX, previousY, currentX, currentY)) return true;
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
  const scale = Math.max(1, Math.abs(endX - startX), Math.abs(endY - startY));
  if (Math.abs(cross) > Number.EPSILON * scale * 16) return false;
  return (
    x >= Math.min(startX, endX) &&
    x <= Math.max(startX, endX) &&
    y >= Math.min(startY, endY) &&
    y <= Math.max(startY, endY)
  );
}
