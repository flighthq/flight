import type { SvgClipHandler, SvgRegistry } from '@flighthq/types/contract';
import { SvgClipKind } from '@flighthq/types/contract';

import { svgPathClipHandler } from './svgClip.ts';
import { registerSvgClipHandler } from './svgRegistry.ts';

/**
 * The clip family: every handler Flight lowers an SVG clip with, and the registrar that installs them all.
 *
 * ★ ONE MEMBER TODAY, AND THE FAMILY IS STILL THE POINT. Clipping used to be a step in the element walk, which meant
 * `@flighthq/clip`, the bounding-box measurement, a second reading of the geometry elements and a second resolution of
 * `use` were in every bundle — a text-only import paid for clipping it could never use, and no configuration could
 * decline it. Naming the family is what lets a caller leave it out, and what gives `filter` somewhere to land if it is
 * ever carried.
 */
export function registerSvgClipHandlers(registry: SvgRegistry): void {
  registerSvgClipHandler(registry, SvgClipKind.Path, svgPathClipHandler);
}

export const svgAllClipHandlers: readonly SvgClipHandler[] = [svgPathClipHandler];
