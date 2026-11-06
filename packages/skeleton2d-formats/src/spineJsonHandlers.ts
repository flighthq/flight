import type { SpineJsonRegistry } from './contract.skeleton2d-formats-types.ts';
import { registerSpineJsonSectionHandlers } from './spineJsonSectionHandlers.ts';
import { registerSpineJsonTimelineHandlers } from './spineJsonTimelineHandlers.ts';

export function registerAllSpineJsonHandlers(registry: SpineJsonRegistry): void {
  registerSpineJsonSectionHandlers(registry);
  registerSpineJsonTimelineHandlers(registry);
}
