import type { Surface } from '@flighthq/types/contract';

import { getCanvasForTarget, getElementForTarget } from './webHostTarget';

// Anchors a surface's drawable in the document. A web drawable is invisible until it is in the DOM, and
// nothing in surface creation puts it there — allocation and presentation are separate acts, which is why
// a surface can be created and rendered into headlessly. Returns false when the surface's target does not
// resolve to an element this host owns.
export function appendWebSurface(surface: Readonly<Surface>, parent: HTMLElement): boolean {
  const element = getElementForTarget(surface.target);
  if (element === null) return false;
  parent.appendChild(element);
  return true;
}

// The canvas-typed form of getWebSurfaceElement, for callers that read the backing store directly
// (`.width`/`.height`) or hand the element to a canvas-only API. Returns null when the surface's target is
// not backed by a canvas — a DOM-rendered target, or one this host does not own.
export function getWebSurfaceCanvas(surface: Readonly<Surface>): HTMLCanvasElement | null {
  return getCanvasForTarget(surface.target);
}

// The deliberate escape hatch to the host representation, for the DOM work this package does not wrap:
// CSS classes, ResizeObserver, listeners. Web types are legal here because this package IS the web; the
// portable layers name no DOM type, which is the boundary this function exists to keep intact.
export function getWebSurfaceElement(surface: Readonly<Surface>): HTMLElement | null {
  return getElementForTarget(surface.target);
}
