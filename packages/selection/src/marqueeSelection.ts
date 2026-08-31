import { createRectangle, enclosesRectangle, intersectsRectangle } from '@flighthq/geometry/contract';
import { getNodeLocalBoundsRectangle } from '@flighthq/node/contract';
import type {
  BoundsNodeAny,
  MarqueeSelection,
  MarqueeSelectionMode,
  MarqueeSelectionRuntime,
  Rectangle,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

export function beginMarqueeSelection(selection: MarqueeSelection, startX: number, startY: number): void {
  const runtime = getMarqueeSelectionRuntime(selection);
  runtime.active = true;
  runtime.startX = startX;
  runtime.startY = startY;
  setMarqueeRectangle(runtime.rectangle, startX, startY, startX, startY);
}

export function createMarqueeSelection(): MarqueeSelection {
  const selection = { [EntityRuntimeKey]: undefined } as MarqueeSelection;
  const runtime = {
    active: false,
    binding: null,
    rectangle: createRectangle(),
    startX: 0,
    startY: 0,
  } satisfies MarqueeSelectionRuntime;
  selection[EntityRuntimeKey] = runtime;
  return selection;
}

export function endMarqueeSelection(selection: MarqueeSelection): Rectangle {
  const runtime = getMarqueeSelectionRuntime(selection);
  runtime.active = false;
  return runtime.rectangle;
}

export function findNodesInMarqueeSelection<NodeType extends BoundsNodeAny>(
  selection: Readonly<MarqueeSelection>,
  candidates: readonly NodeType[],
  mode: MarqueeSelectionMode = 'intersect',
): NodeType[] {
  const rectangle = getMarqueeSelectionRuntime(selection).rectangle;
  const matches: NodeType[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const bounds = getNodeLocalBoundsRectangle(candidate);
    if (mode === 'contain' ? enclosesRectangle(rectangle, bounds) : intersectsRectangle(rectangle, bounds)) {
      matches.push(candidate);
    }
  }
  return matches;
}

export function getMarqueeRectangle(selection: Readonly<MarqueeSelection>): Readonly<Rectangle> {
  return getMarqueeSelectionRuntime(selection).rectangle;
}

export function updateMarqueeSelection(selection: MarqueeSelection, currentX: number, currentY: number): void {
  const runtime = getMarqueeSelectionRuntime(selection);
  if (!runtime.active) return;
  setMarqueeRectangle(runtime.rectangle, runtime.startX, runtime.startY, currentX, currentY);
}

function getMarqueeSelectionRuntime(selection: Readonly<MarqueeSelection>): MarqueeSelectionRuntime {
  return selection[EntityRuntimeKey] as MarqueeSelectionRuntime;
}

function setMarqueeRectangle(rectangle: Rectangle, startX: number, startY: number, endX: number, endY: number): void {
  rectangle.x = Math.min(startX, endX);
  rectangle.y = Math.min(startY, endY);
  rectangle.width = Math.abs(endX - startX);
  rectangle.height = Math.abs(endY - startY);
}
