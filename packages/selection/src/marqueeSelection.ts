// Generated from crates/flight-selection/src/marquee_selection.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';
import { createRectangle, enclosesRectangle, intersectsRectangle } from '@flighthq/geometry/contract';
import type { Rectangle } from '@flighthq/geometry/contract';
import { getNodeLocalBoundsRectangle } from '@flighthq/node/contract';
import type { NodeRef } from '@flighthq/node/contract';

import type { MarqueeSelectionRaw } from './types.ts';
import { MarqueeSelectionModeRaw } from './types.ts';
import { marqueeSelectionStateStore } from './types.ts';

export function beginMarqueeSelectionCore(selection: MarqueeSelectionRaw, startX: number, startY: number): void {
  marqueeSelectionStateStore.get(selection)!.active = true;
  marqueeSelectionStateStore.get(selection)!.startX = startX;
  marqueeSelectionStateStore.get(selection)!.startY = startY;
  setMarqueeRectangle(marqueeSelectionStateStore.get(selection)!.rectangle, startX, startY, startX, startY);
}

export function createMarqueeSelectionCore(): MarqueeSelectionRaw {
  let out: MarqueeSelectionRaw = allocateEntity<MarqueeSelectionRaw>();
  initializeMarqueeSelectionCore(out);
  return out;
}

export function endMarqueeSelectionCore(selection: MarqueeSelectionRaw): Readonly<Rectangle> {
  marqueeSelectionStateStore.get(selection)!.active = false;
  return marqueeSelectionStateStore.get(selection)!.rectangle;
}

export function findNodesInMarqueeSelectionInto(
  out: NodeRef[],
  selection: Readonly<MarqueeSelectionRaw>,
  candidates: Readonly<NodeRef[]>,
  mode?: MarqueeSelectionModeRaw,
): void {
  mode = mode ?? MarqueeSelectionModeRaw.Intersect;
  out.length = 0;
  for (const candidate of candidates) {
    const bounds = getNodeLocalBoundsRectangle(candidate);
    const isMatch = (() => {
      const matchValue = mode;
      switch (matchValue) {
        case MarqueeSelectionModeRaw.Contain:
          return (() => {
            return enclosesRectangle(marqueeSelectionStateStore.get(selection)!.rectangle, bounds);
          })();
        case MarqueeSelectionModeRaw.Intersect:
          return (() => {
            return intersectsRectangle(marqueeSelectionStateStore.get(selection)!.rectangle, bounds);
          })();
      }
    })();
    if (isMatch) {
      out.push(candidate);
    }
  }
}

export function getMarqueeRectangleCore(selection: Readonly<MarqueeSelectionRaw>): Readonly<Rectangle> {
  return marqueeSelectionStateStore.get(selection)!.rectangle;
}

export function initializeMarqueeSelectionCore(out: MarqueeSelectionRaw): void {
  marqueeSelectionStateStore.set(out, {
    active: false,
    rectangle: createRectangle(0.0, 0.0, 0.0, 0.0),
    startX: 0.0,
    startY: 0.0,
  });
}

function setMarqueeRectangle(rectangle: Rectangle, startX: number, startY: number, endX: number, endY: number): void {
  rectangle.x = Math.min(startX, endX);
  rectangle.y = Math.min(startY, endY);
  rectangle.width = Math.abs(endX - startX);
  rectangle.height = Math.abs(endY - startY);
}

export function updateMarqueeSelectionCore(selection: MarqueeSelectionRaw, currentX: number, currentY: number): void {
  if (!marqueeSelectionStateStore.get(selection)!.active) {
    return;
  }
  setMarqueeRectangle(
    marqueeSelectionStateStore.get(selection)!.rectangle,
    marqueeSelectionStateStore.get(selection)!.startX,
    marqueeSelectionStateStore.get(selection)!.startY,
    currentX,
    currentY,
  );
}
