import type { SpineBinaryRegistry } from './contract.skeleton2d-formats-types.ts';
import { registerSpineBinarySectionHandlers } from './spineBinarySectionHandlers.ts';
import { registerSpineBinaryTimelineHandlers } from './spineBinaryTimelineHandlers.ts';

/** Registers every built-in Spine binary section and timeline handler. */
export function registerAllSpineBinaryHandlers(registry: SpineBinaryRegistry): void {
  registerSpineBinarySectionHandlers(registry);
  registerSpineBinaryTimelineHandlers(registry);
}
