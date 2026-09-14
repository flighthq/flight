import type { SpineBinaryRegistry } from '@flighthq/types/contract';

import { registerSpineBinarySectionHandlers } from './spineBinarySectionHandlers';
import { registerSpineBinaryTimelineHandlers } from './spineBinaryTimelineHandlers';

/** Registers every built-in Spine binary section and timeline handler. */
export function registerAllSpineBinaryHandlers(registry: SpineBinaryRegistry): void {
  registerSpineBinarySectionHandlers(registry);
  registerSpineBinaryTimelineHandlers(registry);
}
