import type { SpineBinarySectionHandler, SpineBinaryTimelineHandler } from '@flighthq/types/contract';
import { SpineBinarySectionKind, SpineBinaryTimelineKind } from '@flighthq/types/contract';

import {
  createSpineBinaryRegistry,
  getSpineBinarySectionHandler,
  getSpineBinaryTimelineHandler,
  registerSpineBinarySectionHandler,
  registerSpineBinaryTimelineHandler,
  unregisterSpineBinarySectionHandler,
  unregisterSpineBinaryTimelineHandler,
} from './spineBinaryRegistry.ts';

describe('createSpineBinaryRegistry', () => {
  it('creates independent empty registries', () => {
    const first = createSpineBinaryRegistry();
    const second = createSpineBinaryRegistry();
    // Both families start empty — the retired initializer asserted this, and losing it would let a
    // registry ship with one family pre-populated and nothing notice.
    expect(first.sectionHandlers).toEqual([]);
    expect(first.timelineHandlers).toEqual([]);
    registerSpineBinarySectionHandler(first, SpineBinarySectionKind.Bones, () => {});
    expect(first.sectionHandlers).toHaveLength(1);
    expect(second.sectionHandlers).toEqual([]);
  });
});

describe('getSpineBinarySectionHandler', () => {
  it('returns null for an unregistered section', () => {
    expect(getSpineBinarySectionHandler(createSpineBinaryRegistry(), SpineBinarySectionKind.Bones)).toBeNull();
  });
});

describe('getSpineBinaryTimelineHandler', () => {
  it('returns null for an unregistered timeline family', () => {
    expect(getSpineBinaryTimelineHandler(createSpineBinaryRegistry(), SpineBinaryTimelineKind.Bone)).toBeNull();
  });
});

describe('registerSpineBinarySectionHandler', () => {
  it('is last-write-wins without moving the registered key', () => {
    const registry = createSpineBinaryRegistry();
    const first: SpineBinarySectionHandler = () => {};
    const second: SpineBinarySectionHandler = () => {};
    registerSpineBinarySectionHandler(registry, SpineBinarySectionKind.Bones, first);
    registerSpineBinarySectionHandler(registry, SpineBinarySectionKind.Bones, second);
    expect(registry.sectionHandlers).toHaveLength(1);
    expect(getSpineBinarySectionHandler(registry, SpineBinarySectionKind.Bones)).toBe(second);
  });

  it('accepts source extensions outside the built-in section vocabulary', () => {
    const registry = createSpineBinaryRegistry();
    const handler: SpineBinarySectionHandler = () => {};
    registerSpineBinarySectionHandler(registry, 'vendorSection', handler);
    expect(getSpineBinarySectionHandler(registry, 'vendorSection')).toBe(handler);
  });
});

describe('registerSpineBinaryTimelineHandler', () => {
  it('is last-write-wins without moving the registered key', () => {
    const registry = createSpineBinaryRegistry();
    const first: SpineBinaryTimelineHandler = () => {};
    const second: SpineBinaryTimelineHandler = () => {};
    registerSpineBinaryTimelineHandler(registry, SpineBinaryTimelineKind.Bone, first);
    registerSpineBinaryTimelineHandler(registry, SpineBinaryTimelineKind.Bone, second);
    expect(registry.timelineHandlers).toHaveLength(1);
    expect(getSpineBinaryTimelineHandler(registry, SpineBinaryTimelineKind.Bone)).toBe(second);
  });

  it('accepts source extensions outside the built-in timeline vocabulary', () => {
    const registry = createSpineBinaryRegistry();
    const handler: SpineBinaryTimelineHandler = () => {};
    registerSpineBinaryTimelineHandler(registry, 'vendorTimeline', handler);
    expect(getSpineBinaryTimelineHandler(registry, 'vendorTimeline')).toBe(handler);
  });
});

describe('unregisterSpineBinarySectionHandler', () => {
  it('removes only a present section handler', () => {
    const registry = createSpineBinaryRegistry();
    registerSpineBinarySectionHandler(registry, SpineBinarySectionKind.Bones, () => {});
    expect(unregisterSpineBinarySectionHandler(registry, SpineBinarySectionKind.Bones)).toBe(true);
    expect(unregisterSpineBinarySectionHandler(registry, SpineBinarySectionKind.Bones)).toBe(false);
  });
});

describe('unregisterSpineBinaryTimelineHandler', () => {
  it('removes only a present timeline handler', () => {
    const registry = createSpineBinaryRegistry();
    registerSpineBinaryTimelineHandler(registry, SpineBinaryTimelineKind.Bone, () => {});
    expect(unregisterSpineBinaryTimelineHandler(registry, SpineBinaryTimelineKind.Bone)).toBe(true);
    expect(unregisterSpineBinaryTimelineHandler(registry, SpineBinaryTimelineKind.Bone)).toBe(false);
  });
});
