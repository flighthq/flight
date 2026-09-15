import { describe, expect, it } from 'vitest';

import { registerAllSpineBinaryHandlers } from './spineBinaryHandlers';
import { createSpineBinaryRegistry } from './spineBinaryRegistry';
import { registerSpineBinarySectionHandlers } from './spineBinarySectionHandlers';
import { registerSpineBinaryTimelineHandlers } from './spineBinaryTimelineHandlers';

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
