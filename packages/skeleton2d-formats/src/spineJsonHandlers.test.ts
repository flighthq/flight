import { describe, expect, it } from 'vitest';

import { registerAllSpineJsonHandlers } from './spineJsonHandlers.ts';
import { createSpineJsonRegistry } from './spineJsonRegistry.ts';
import { registerSpineJsonSectionHandlers } from './spineJsonSectionHandlers.ts';
import { registerSpineJsonTimelineHandlers } from './spineJsonTimelineHandlers.ts';

describe('registerAllSpineJsonHandlers', () => {
  it('registers both handler families', () => {
    const registry = createSpineJsonRegistry();
    registerAllSpineJsonHandlers(registry);
    const sections = createSpineJsonRegistry();
    registerSpineJsonSectionHandlers(sections);
    const timelines = createSpineJsonRegistry();
    registerSpineJsonTimelineHandlers(timelines);
    expect(registry.sectionHandlers).toEqual(sections.sectionHandlers);
    expect(registry.timelineHandlers).toEqual(timelines.timelineHandlers);
  });
});
