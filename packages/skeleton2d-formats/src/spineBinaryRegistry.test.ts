import type { SpineBinarySectionHandler, SpineBinaryTimelineHandler } from '@flighthq/types/contract';
import { SpineBinarySectionKind, SpineBinaryTimelineKind } from '@flighthq/types/contract';

import {
  createSpineBinaryRegistry,
  getSpineBinarySectionHandler,
  getSpineBinaryTimelineHandler,
  initializeSpineBinaryRegistry,
  registerSpineBinarySectionHandler,
  registerSpineBinaryTimelineHandler,
  unregisterSpineBinarySectionHandler,
  unregisterSpineBinaryTimelineHandler,
} from './spineBinaryRegistry';

describe('createSpineBinaryRegistry', () => {
  it('creates independent empty registries', () => {
    const first = createSpineBinaryRegistry();
    const second = createSpineBinaryRegistry();
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

describe('initializeSpineBinaryRegistry', () => {
  it('initializes both handler families', () => {
    const out = {} as ReturnType<typeof createSpineBinaryRegistry>;
    initializeSpineBinaryRegistry(out);
    expect(out.sectionHandlers).toEqual([]);
    expect(out.timelineHandlers).toEqual([]);
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
