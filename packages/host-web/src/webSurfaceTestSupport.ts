import { finishEntity } from '@flighthq/entity/contract';
import { allocateSurface } from '@flighthq/surface/contract';
import type { Surface } from '@flighthq/types/contract';

// Builds a Surface around an element the caller already owns, the way a host's create lane would. This is
// the web adopt path: an existing canvas in a page Flight did not build.
export function createWebSurfaceFromElement(element: HTMLElement): Surface {
  return finishEntity(allocateSurface<Surface>(element));
}
