import type { DragonBonesSectionHandler, DragonBonesTimelineHandler } from '@flighthq/types/contract';
import { DragonBonesSectionKind, DragonBonesTimelineKind } from '@flighthq/types/contract';

import {
  createDragonBonesRegistry,
  getDragonBonesSectionHandler,
  getDragonBonesTimelineHandler,
  registerDragonBonesSectionHandler,
  registerDragonBonesTimelineHandler,
  unregisterDragonBonesSectionHandler,
  unregisterDragonBonesTimelineHandler,
} from './dragonBonesRegistry.ts';

describe('createDragonBonesRegistry', () => {
  it('creates independent empty registries', () => {
    const first = createDragonBonesRegistry();
    const second = createDragonBonesRegistry();
    expect(first.sectionHandlers).toEqual([]);
    expect(first.timelineHandlers).toEqual([]);
    registerDragonBonesSectionHandler(first, DragonBonesSectionKind.Bones, () => {});
    expect(first.sectionHandlers).toHaveLength(1);
    expect(second.sectionHandlers).toEqual([]);
  });
});

describe('getDragonBonesSectionHandler', () => {
  it('returns null for an unregistered section', () => {
    expect(getDragonBonesSectionHandler(createDragonBonesRegistry(), DragonBonesSectionKind.Bones)).toBeNull();
  });
});

describe('getDragonBonesTimelineHandler', () => {
  it('returns null for an unregistered timeline family', () => {
    expect(getDragonBonesTimelineHandler(createDragonBonesRegistry(), DragonBonesTimelineKind.Bone)).toBeNull();
  });
});

describe('registerDragonBonesSectionHandler', () => {
  it('is last-write-wins without moving the registered key', () => {
    const registry = createDragonBonesRegistry();
    const first: DragonBonesSectionHandler = () => {};
    const second: DragonBonesSectionHandler = () => {};
    registerDragonBonesSectionHandler(registry, DragonBonesSectionKind.Bones, first);
    registerDragonBonesSectionHandler(registry, DragonBonesSectionKind.Bones, second);
    expect(registry.sectionHandlers).toHaveLength(1);
    expect(getDragonBonesSectionHandler(registry, DragonBonesSectionKind.Bones)).toBe(second);
  });

  it('accepts source extensions outside the built-in section vocabulary', () => {
    const registry = createDragonBonesRegistry();
    const handler: DragonBonesSectionHandler = () => {};
    registerDragonBonesSectionHandler(registry, 'vendorSection', handler);
    expect(getDragonBonesSectionHandler(registry, 'vendorSection')).toBe(handler);
  });
});

describe('registerDragonBonesTimelineHandler', () => {
  it('is last-write-wins without moving the registered key', () => {
    const registry = createDragonBonesRegistry();
    const first: DragonBonesTimelineHandler = () => {};
    const second: DragonBonesTimelineHandler = () => {};
    registerDragonBonesTimelineHandler(registry, DragonBonesTimelineKind.Bone, first);
    registerDragonBonesTimelineHandler(registry, DragonBonesTimelineKind.Bone, second);
    expect(registry.timelineHandlers).toHaveLength(1);
    expect(getDragonBonesTimelineHandler(registry, DragonBonesTimelineKind.Bone)).toBe(second);
  });

  it('accepts source extensions outside the built-in timeline vocabulary', () => {
    const registry = createDragonBonesRegistry();
    const handler: DragonBonesTimelineHandler = () => {};
    registerDragonBonesTimelineHandler(registry, 'vendorTimeline', handler);
    expect(getDragonBonesTimelineHandler(registry, 'vendorTimeline')).toBe(handler);
  });
});

describe('unregisterDragonBonesSectionHandler', () => {
  it('removes only a present section handler', () => {
    const registry = createDragonBonesRegistry();
    registerDragonBonesSectionHandler(registry, DragonBonesSectionKind.Bones, () => {});
    expect(unregisterDragonBonesSectionHandler(registry, DragonBonesSectionKind.Bones)).toBe(true);
    expect(unregisterDragonBonesSectionHandler(registry, DragonBonesSectionKind.Bones)).toBe(false);
  });
});

describe('unregisterDragonBonesTimelineHandler', () => {
  it('removes only a present timeline handler', () => {
    const registry = createDragonBonesRegistry();
    registerDragonBonesTimelineHandler(registry, DragonBonesTimelineKind.Bone, () => {});
    expect(unregisterDragonBonesTimelineHandler(registry, DragonBonesTimelineKind.Bone)).toBe(true);
    expect(unregisterDragonBonesTimelineHandler(registry, DragonBonesTimelineKind.Bone)).toBe(false);
  });
});
