import { describe, expect, it } from 'vitest';

import { registerAllDragonBonesHandlers } from './dragonBonesHandlers.ts';
import { createDragonBonesRegistry } from './dragonBonesRegistry.ts';
import { registerDragonBonesSectionHandlers } from './dragonBonesSectionHandlers.ts';
import { registerDragonBonesTimelineHandlers } from './dragonBonesTimelineHandlers.ts';

describe('registerAllDragonBonesHandlers', () => {
  it('registers both handler families', () => {
    const registry = createDragonBonesRegistry();
    registerAllDragonBonesHandlers(registry);
    const sections = createDragonBonesRegistry();
    registerDragonBonesSectionHandlers(sections);
    const timelines = createDragonBonesRegistry();
    registerDragonBonesTimelineHandlers(timelines);
    expect(registry.sectionHandlers).toEqual(sections.sectionHandlers);
    expect(registry.timelineHandlers).toEqual(timelines.timelineHandlers);
  });
});
