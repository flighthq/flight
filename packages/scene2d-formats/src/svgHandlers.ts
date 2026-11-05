import type { SvgRegistry } from './contract.scene2d-formats-types.ts';
import { registerSvgClipHandlers } from './svgClipHandlers.ts';
import { registerSvgElementHandlers } from './svgElementHandlers.ts';

export function registerAllSvgHandlers(registry: SvgRegistry): void {
  registerSvgClipHandlers(registry);
  registerSvgElementHandlers(registry);
}
