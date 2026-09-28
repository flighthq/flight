import type { SvgRegistry } from '@flighthq/types/contract';

import { registerSvgClipHandlers } from './svgClipHandlers.ts';
import { registerSvgElementHandlers } from './svgElementHandlers.ts';

export function registerAllSvgHandlers(registry: SvgRegistry): void {
  registerSvgClipHandlers(registry);
  registerSvgElementHandlers(registry);
}
