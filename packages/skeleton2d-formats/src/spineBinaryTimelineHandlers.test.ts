import type { SpineBinaryTimelineHandler, SpineBinaryTimelineKind } from '@flighthq/types/contract';
import { SpineBinaryTimelineKind as TimelineKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createSpineBinaryRegistry, getSpineBinaryTimelineHandler } from './spineBinaryRegistry';
import {
  registerSpineBinaryTimelineHandlers,
  spineBinaryBoneTimelineHandler,
  spineBinaryDeformTimelineHandler,
  spineBinaryDrawOrderTimelineHandler,
  spineBinaryEventTimelineHandler,
  spineBinaryIkTimelineHandler,
  spineBinaryPathTimelineHandler,
  spineBinarySlotTimelineHandler,
  spineBinaryTransformTimelineHandler,
} from './spineBinaryTimelineHandlers';

function expectRegisteredTimeline(kind: SpineBinaryTimelineKind, handler: SpineBinaryTimelineHandler): void {
  const registry = createSpineBinaryRegistry();
  registerSpineBinaryTimelineHandlers(registry);
  expect(getSpineBinaryTimelineHandler(registry, kind)).toBe(handler);
}

describe('registerSpineBinaryTimelineHandlers', () => {
  it('registers only the eight animation timeline-family handlers', () => {
    const registry = createSpineBinaryRegistry();
    registerSpineBinaryTimelineHandlers(registry);
    expect(registry.sectionHandlers).toEqual([]);
    expect(registry.timelineHandlers).toHaveLength(8);
  });
});

describe('spineBinaryBoneTimelineHandler', () => {
  it('is the built-in Bone timeline handler', () => {
    expectRegisteredTimeline(TimelineKind.Bone, spineBinaryBoneTimelineHandler);
  });
});

describe('spineBinaryDeformTimelineHandler', () => {
  it('is the built-in Deform timeline handler', () => {
    expectRegisteredTimeline(TimelineKind.Deform, spineBinaryDeformTimelineHandler);
  });
});

describe('spineBinaryDrawOrderTimelineHandler', () => {
  it('is the built-in DrawOrder timeline handler', () => {
    expectRegisteredTimeline(TimelineKind.DrawOrder, spineBinaryDrawOrderTimelineHandler);
  });
});

describe('spineBinaryEventTimelineHandler', () => {
  it('is the built-in Event timeline handler', () => {
    expectRegisteredTimeline(TimelineKind.Event, spineBinaryEventTimelineHandler);
  });
});

describe('spineBinaryIkTimelineHandler', () => {
  it('is the built-in Ik timeline handler', () => {
    expectRegisteredTimeline(TimelineKind.Ik, spineBinaryIkTimelineHandler);
  });
});

describe('spineBinaryPathTimelineHandler', () => {
  it('is the built-in Path timeline handler', () => {
    expectRegisteredTimeline(TimelineKind.Path, spineBinaryPathTimelineHandler);
  });
});

describe('spineBinarySlotTimelineHandler', () => {
  it('is the built-in Slot timeline handler', () => {
    expectRegisteredTimeline(TimelineKind.Slot, spineBinarySlotTimelineHandler);
  });
});

describe('spineBinaryTransformTimelineHandler', () => {
  it('is the built-in Transform timeline handler', () => {
    expectRegisteredTimeline(TimelineKind.Transform, spineBinaryTransformTimelineHandler);
  });
});
