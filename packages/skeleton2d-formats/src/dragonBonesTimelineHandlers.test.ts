import type { DragonBonesTimelineHandler, DragonBonesTimelineKind } from '@flighthq/types/contract';
import { DragonBonesTimelineKind as TimelineKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { dragonBonesBoneTimelineHandler } from './dragonBonesBoneTimelineHandler.ts';
import { createDragonBonesRegistry, getDragonBonesTimelineHandler } from './dragonBonesRegistry.ts';
import { dragonBonesSlotTimelineHandler } from './dragonBonesSlotTimelineHandler.ts';
import {
  dragonBonesDeformTimelineHandler,
  dragonBonesIkTimelineHandler,
  dragonBonesZOrderTimelineHandler,
} from './dragonBonesStubHandlers.ts';
import { dragonBonesAllTimelineHandlers, registerDragonBonesTimelineHandlers } from './dragonBonesTimelineHandlers.ts';

function expectRegisteredTimeline(kind: DragonBonesTimelineKind, handler: DragonBonesTimelineHandler): void {
  const registry = createDragonBonesRegistry();
  registerDragonBonesTimelineHandlers(registry);
  expect(getDragonBonesTimelineHandler(registry, kind)).toBe(handler);
}

describe('dragonBonesAllTimelineHandlers', () => {
  it('contains every built-in timeline handler', () => {
    expect(dragonBonesAllTimelineHandlers).toContain(dragonBonesBoneTimelineHandler);
    expect(dragonBonesAllTimelineHandlers).toContain(dragonBonesDeformTimelineHandler);
    expect(dragonBonesAllTimelineHandlers).toContain(dragonBonesIkTimelineHandler);
    expect(dragonBonesAllTimelineHandlers).toContain(dragonBonesSlotTimelineHandler);
    expect(dragonBonesAllTimelineHandlers).toContain(dragonBonesZOrderTimelineHandler);
    expect(dragonBonesAllTimelineHandlers).toHaveLength(5);
  });
});

describe('dragonBonesBoneTimelineHandler', () => {
  it('is the built-in Bone timeline handler', () => {
    expectRegisteredTimeline(TimelineKind.Bone, dragonBonesBoneTimelineHandler);
  });
});

describe('dragonBonesDeformTimelineHandler', () => {
  it('is the built-in Deform timeline handler', () => {
    expectRegisteredTimeline(TimelineKind.Deform, dragonBonesDeformTimelineHandler);
  });
});

describe('dragonBonesIkTimelineHandler', () => {
  it('is the built-in Ik timeline handler', () => {
    expectRegisteredTimeline(TimelineKind.Ik, dragonBonesIkTimelineHandler);
  });
});

describe('dragonBonesSlotTimelineHandler', () => {
  it('is the built-in Slot timeline handler', () => {
    expectRegisteredTimeline(TimelineKind.Slot, dragonBonesSlotTimelineHandler);
  });
});

describe('dragonBonesZOrderTimelineHandler', () => {
  it('is the built-in ZOrder timeline handler', () => {
    expectRegisteredTimeline(TimelineKind.ZOrder, dragonBonesZOrderTimelineHandler);
  });
});

describe('registerDragonBonesTimelineHandlers', () => {
  it('registers exactly one handler for every timeline family and no section handlers', () => {
    const registry = createDragonBonesRegistry();
    registerDragonBonesTimelineHandlers(registry);
    expect(registry.sectionHandlers).toEqual([]);
    expect(registry.timelineHandlers.map((entry) => entry.kind).sort()).toEqual(Object.values(TimelineKind).sort());
  });
});
