import type { SpineJsonSectionHandler, SpineJsonTimelineHandler } from '@flighthq/types/contract';
import { SpineJsonSectionKind, SpineJsonTimelineKind } from '@flighthq/types/contract';

import {
  createSpineJsonRegistry,
  getSpineJsonSectionHandler,
  getSpineJsonTimelineHandler,
  registerSpineJsonSectionHandler,
  registerSpineJsonTimelineHandler,
  unregisterSpineJsonSectionHandler,
  unregisterSpineJsonTimelineHandler,
} from './spineJsonRegistry.ts';

describe('createSpineJsonRegistry', () => {
  it('creates independent empty registries', () => {
    const first = createSpineJsonRegistry();
    const second = createSpineJsonRegistry();
    expect(first.sectionHandlers).toEqual([]);
    expect(first.timelineHandlers).toEqual([]);
    registerSpineJsonSectionHandler(first, SpineJsonSectionKind.Bones, () => {});
    expect(first.sectionHandlers).toHaveLength(1);
    expect(second.sectionHandlers).toEqual([]);
  });
});

describe('getSpineJsonSectionHandler', () => {
  it('returns null for an unregistered section', () => {
    expect(getSpineJsonSectionHandler(createSpineJsonRegistry(), SpineJsonSectionKind.Bones)).toBeNull();
  });
});

describe('getSpineJsonTimelineHandler', () => {
  it('returns null for an unregistered timeline family', () => {
    expect(getSpineJsonTimelineHandler(createSpineJsonRegistry(), SpineJsonTimelineKind.Bone)).toBeNull();
  });
});

describe('registerSpineJsonSectionHandler', () => {
  it('is last-write-wins without moving the registered key', () => {
    const registry = createSpineJsonRegistry();
    const first: SpineJsonSectionHandler = () => {};
    const second: SpineJsonSectionHandler = () => {};
    registerSpineJsonSectionHandler(registry, SpineJsonSectionKind.Bones, first);
    registerSpineJsonSectionHandler(registry, SpineJsonSectionKind.Bones, second);
    expect(registry.sectionHandlers).toHaveLength(1);
    expect(getSpineJsonSectionHandler(registry, SpineJsonSectionKind.Bones)).toBe(second);
  });

  it('accepts source extensions outside the built-in section vocabulary', () => {
    const registry = createSpineJsonRegistry();
    const handler: SpineJsonSectionHandler = () => {};
    registerSpineJsonSectionHandler(registry, 'vendorSection', handler);
    expect(getSpineJsonSectionHandler(registry, 'vendorSection')).toBe(handler);
  });
});

describe('registerSpineJsonTimelineHandler', () => {
  it('is last-write-wins without moving the registered key', () => {
    const registry = createSpineJsonRegistry();
    const first: SpineJsonTimelineHandler = () => {};
    const second: SpineJsonTimelineHandler = () => {};
    registerSpineJsonTimelineHandler(registry, SpineJsonTimelineKind.Bone, first);
    registerSpineJsonTimelineHandler(registry, SpineJsonTimelineKind.Bone, second);
    expect(registry.timelineHandlers).toHaveLength(1);
    expect(getSpineJsonTimelineHandler(registry, SpineJsonTimelineKind.Bone)).toBe(second);
  });

  it('accepts source extensions outside the built-in timeline vocabulary', () => {
    const registry = createSpineJsonRegistry();
    const handler: SpineJsonTimelineHandler = () => {};
    registerSpineJsonTimelineHandler(registry, 'vendorTimeline', handler);
    expect(getSpineJsonTimelineHandler(registry, 'vendorTimeline')).toBe(handler);
  });
});

describe('unregisterSpineJsonSectionHandler', () => {
  it('removes only a present section handler', () => {
    const registry = createSpineJsonRegistry();
    registerSpineJsonSectionHandler(registry, SpineJsonSectionKind.Bones, () => {});
    expect(unregisterSpineJsonSectionHandler(registry, SpineJsonSectionKind.Bones)).toBe(true);
    expect(unregisterSpineJsonSectionHandler(registry, SpineJsonSectionKind.Bones)).toBe(false);
  });
});

describe('unregisterSpineJsonTimelineHandler', () => {
  it('removes only a present timeline handler', () => {
    const registry = createSpineJsonRegistry();
    registerSpineJsonTimelineHandler(registry, SpineJsonTimelineKind.Bone, () => {});
    expect(unregisterSpineJsonTimelineHandler(registry, SpineJsonTimelineKind.Bone)).toBe(true);
    expect(unregisterSpineJsonTimelineHandler(registry, SpineJsonTimelineKind.Bone)).toBe(false);
  });
});
