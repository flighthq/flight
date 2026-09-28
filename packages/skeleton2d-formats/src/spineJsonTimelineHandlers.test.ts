import type { SpineJsonTimelineHandler, SpineJsonTimelineKind } from '@flighthq/types/contract';
import { SpineJsonTimelineKind as TimelineKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { spineJsonBoneTimelineHandler } from './spineJsonBoneTimelineHandler.ts';
import { spineJsonDrawOrderTimelineHandler } from './spineJsonDrawOrderTimelineHandler.ts';
import { createSpineJsonRegistry, getSpineJsonTimelineHandler } from './spineJsonRegistry.ts';
import { spineJsonSlotTimelineHandler } from './spineJsonSlotTimelineHandler.ts';
import {
  spineJsonDeformTimelineHandler,
  spineJsonEventTimelineHandler,
  spineJsonIkTimelineHandler,
  spineJsonPathTimelineHandler,
  spineJsonTransformTimelineHandler,
} from './spineJsonStubHandlers.ts';
import { registerSpineJsonTimelineHandlers } from './spineJsonTimelineHandlers.ts';

function expectRegisteredTimeline(kind: SpineJsonTimelineKind, handler: SpineJsonTimelineHandler): void {
  const registry = createSpineJsonRegistry();
  registerSpineJsonTimelineHandlers(registry);
  expect(getSpineJsonTimelineHandler(registry, kind)).toBe(handler);
}

describe('registerSpineJsonTimelineHandlers', () => {
  it('registers exactly one handler for every timeline family and no section handlers', () => {
    const registry = createSpineJsonRegistry();
    registerSpineJsonTimelineHandlers(registry);
    expect(registry.sectionHandlers).toEqual([]);
    expect(registry.timelineHandlers.map((entry) => entry.kind).sort()).toEqual(Object.values(TimelineKind).sort());
  });
});

describe('spineJsonBoneTimelineHandler', () => {
  it('is the built-in Bone timeline handler', () => {
    expectRegisteredTimeline(TimelineKind.Bone, spineJsonBoneTimelineHandler);
  });
});

describe('spineJsonDeformTimelineHandler', () => {
  it('is the built-in Deform timeline handler', () => {
    expectRegisteredTimeline(TimelineKind.Deform, spineJsonDeformTimelineHandler);
  });
});

describe('spineJsonDrawOrderTimelineHandler', () => {
  it('is the built-in DrawOrder timeline handler', () => {
    expectRegisteredTimeline(TimelineKind.DrawOrder, spineJsonDrawOrderTimelineHandler);
  });
});

describe('spineJsonEventTimelineHandler', () => {
  it('is the built-in Event timeline handler', () => {
    expectRegisteredTimeline(TimelineKind.Event, spineJsonEventTimelineHandler);
  });
});

describe('spineJsonIkTimelineHandler', () => {
  it('is the built-in Ik timeline handler', () => {
    expectRegisteredTimeline(TimelineKind.Ik, spineJsonIkTimelineHandler);
  });
});

describe('spineJsonPathTimelineHandler', () => {
  it('is the built-in Path timeline handler', () => {
    expectRegisteredTimeline(TimelineKind.Path, spineJsonPathTimelineHandler);
  });
});

describe('spineJsonSlotTimelineHandler', () => {
  it('is the built-in Slot timeline handler', () => {
    expectRegisteredTimeline(TimelineKind.Slot, spineJsonSlotTimelineHandler);
  });
});

describe('spineJsonTransformTimelineHandler', () => {
  it('is the built-in Transform timeline handler', () => {
    expectRegisteredTimeline(TimelineKind.Transform, spineJsonTransformTimelineHandler);
  });
});
