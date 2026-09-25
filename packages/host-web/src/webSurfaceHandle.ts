import { finishEntity } from '@flighthq/entity/contract';
import { allocateSurface, getSurfaceHandle } from '@flighthq/surface/contract';
import type { AppWindow, NativeSurfaceHandle, Surface } from '@flighthq/types/contract';

import { getWebWindowHandle } from './webWindow.ts';

// Allocates a canvas in the given window's document, sized in device pixels. Every web drawable capability
// creates through here: on the web the element factory and the drawable are the same call, which is why no
// separate drawable-allocation capability exists. Presentation — anchoring in the document, display size —
// is deliberately not done here.
export function allocateWebSurfaceCanvas(
  win: Readonly<AppWindow>,
  width: number,
  height: number,
): NativeSurfaceHandle | null {
  const handle = getWebWindowHandle(win);
  if (handle === null) return null;
  const canvas = handle.document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

// Builds a Surface around an element the caller already owns — an existing canvas in a page Flight did
// not build. The caller keeps ownership of the element; nothing here appends or sizes it.
export function createWebSurfaceFromElement(element: HTMLElement): Surface {
  return finishEntity(allocateSurface<Surface>(element));
}

// The canvas a surface was built around, or null when its drawable is not one — a DOM-rendered container,
// or a surface some other host allocated. Narrowing the opaque handle is the allocating host's job, and
// this is where the web host does it.
export function getWebSurfaceCanvasHandle(surface: Readonly<Surface>): HTMLCanvasElement | null {
  const handle = getSurfaceHandle(surface);
  return handle instanceof HTMLCanvasElement ? handle : null;
}

// The element a surface was built around, canvas or not.
export function getWebSurfaceElementHandle(surface: Readonly<Surface>): HTMLElement | null {
  const handle = getSurfaceHandle(surface);
  return handle instanceof HTMLElement ? handle : null;
}
