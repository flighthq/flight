import type { SpineJsonRegistry } from '@flighthq/types/contract';

import { registerSpineJsonSectionHandlers } from './spineJsonSectionHandlers.ts';
import { registerSpineJsonTimelineHandlers } from './spineJsonTimelineHandlers.ts';

export function registerAllSpineJsonHandlers(registry: SpineJsonRegistry): void {
  registerSpineJsonSectionHandlers(registry);
  registerSpineJsonTimelineHandlers(registry);
}
