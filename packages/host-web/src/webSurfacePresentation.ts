import type { Surface } from '@flighthq/types/contract';

import { getWebSurfaceCanvasHandle, getWebSurfaceElementHandle } from './webSurfaceHandle';

// Anchors a surface's drawable in the document. A web drawable is invisible until it is in the DOM, and
// nothing in surface creation puts it there — allocation and presentation are separate acts, which is why
// a surface can be created and rendered into headlessly. Returns false when the surface's drawable is not
// an element this host allocated.
export function appendWebSurface(surface: Readonly<Surface>, parent: HTMLElement): boolean {
  const element = getWebSurfaceElementHandle(surface);
  if (element === null) return false;
  parent.appendChild(element);
  return true;
}

// The canvas-typed form of getWebSurfaceElement, for callers that read the backing store directly
// (`.width`/`.height`) or hand the drawable to a canvas-only API.
export function getWebSurfaceCanvas(surface: Readonly<Surface>): HTMLCanvasElement | null {
  return getWebSurfaceCanvasHandle(surface);
}

// The deliberate escape hatch to the host representation, for the DOM work this package does not wrap:
// CSS classes, ResizeObserver, listeners. Web types are legal here because this package IS the web; the
// portable layers name no DOM type, which is the boundary this function exists to keep intact.
export function getWebSurfaceElement(surface: Readonly<Surface>): HTMLElement | null {
  return getWebSurfaceElementHandle(surface);
}
