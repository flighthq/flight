import { describe, expect, it } from 'vitest';

import { registerAllSpineBinaryHandlers } from './spineBinaryHandlers.ts';
import { createSpineBinaryRegistry } from './spineBinaryRegistry.ts';
import { registerSpineBinarySectionHandlers } from './spineBinarySectionHandlers.ts';
import { registerSpineBinaryTimelineHandlers } from './spineBinaryTimelineHandlers.ts';

describe('registerAllSpineBinaryHandlers', () => {
  it('registers both handler families', () => {
    const registry = createSpineBinaryRegistry();
    registerAllSpineBinaryHandlers(registry);
    const sections = createSpineBinaryRegistry();
    registerSpineBinarySectionHandlers(sections);
    const timelines = createSpineBinaryRegistry();
    registerSpineBinaryTimelineHandlers(timelines);
    expect(registry.sectionHandlers).toEqual(sections.sectionHandlers);
    expect(registry.timelineHandlers).toEqual(timelines.timelineHandlers);
  });
});
