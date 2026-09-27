import type { SvgRegistry } from '@flighthq/types/contract';

import { registerSvgElementHandlers } from './svgElementHandlers.ts';

export function registerAllSvgHandlers(registry: SvgRegistry): void {
  registerSvgElementHandlers(registry);
}
