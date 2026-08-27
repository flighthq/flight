import { getNodeHitArea, isNodeHitTestEnabled } from '@flighthq/interaction/contract';
import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type { Entity } from '@flighthq/types/contract';

import {
  clampGuiValue,
  configureGuiHitArea,
  connectGuiInteraction,
  connectGuiSignal,
  createGuiController,
  createGuiControllerRuntime,
  disposeGuiController,
  getGuiControllerRuntime,
  getGuiLength,
  getGuiPosition,
  setGuiPosition,
  setGuiScale,
  setGuiVisible,
  setGuiVisualProperty,
  snapGuiValue,
} from './guiController';
import { createGuiTestNode, emitGuiPointer } from './guiTestHelper';

describe('clampGuiValue', () => {
  it('clamps finite values and normalizes reversed bounds', () => {
    expect(clampGuiValue(8, 0, 5)).toBe(5);
    expect(clampGuiValue(2, 5, 0)).toBe(2);
    expect(clampGuiValue(NaN, 2, 5)).toBe(2);
  });
});

describe('configureGuiHitArea', () => {
  it('restores a caller hit area on disposal', () => {
    const target = createGuiTestNode();
    const area = createGuiTestNode();
    const runtime = createGuiControllerRuntime({});
    const controller = createGuiController<Entity, typeof runtime>(runtime);
    configureGuiHitArea(runtime, target, area);
    expect(getNodeHitArea(target)).toBe(area);
    disposeGuiController(controller, () => {});
    expect(getNodeHitArea(target)).toBeNull();
  });
});

describe('connectGuiInteraction', () => {
  it('connects input and restores hit-test state', () => {
    const target = createGuiTestNode();
    const runtime = createGuiControllerRuntime({});
    const controller = createGuiController<Entity, typeof runtime>(runtime);
    let calls = 0;
    connectGuiInteraction(runtime, target, 'onClick', () => calls++);
    emitGuiPointer(target, 'onClick');
    expect(calls).toBe(1);
    disposeGuiController(controller, () => {});
    expect(isNodeHitTestEnabled(target)).toBe(false);
  });
});

describe('connectGuiSignal', () => {
  it('disconnects a generic signal on disposal', () => {
    const signal = createSignal<() => void>();
    const runtime = createGuiControllerRuntime({});
    const controller = createGuiController<Entity, typeof runtime>(runtime);
    let calls = 0;
    connectGuiSignal(runtime, signal, () => calls++);
    disposeGuiController(controller, () => {});
    emitSignal(signal);
    expect(calls).toBe(0);
  });
});

describe('createGuiController', () => {
  it('stores the supplied runtime', () => {
    const runtime = createGuiControllerRuntime({ value: 4 });
    const controller = createGuiController<Entity, typeof runtime>(runtime);
    expect(getGuiControllerRuntime<{ value: number }>(controller).value).toBe(4);
  });
});

describe('createGuiControllerRuntime', () => {
  it('starts undisposed with no transition', () => {
    const runtime = createGuiControllerRuntime({});
    expect([runtime.disposed, runtime.transition]).toEqual([false, null]);
  });
});

describe('disposeGuiController', () => {
  it('runs clear once', () => {
    const runtime = createGuiControllerRuntime({});
    const controller = createGuiController<Entity, typeof runtime>(runtime);
    let clears = 0;
    disposeGuiController(controller, () => clears++);
    disposeGuiController(controller, () => clears++);
    expect(clears).toBe(1);
  });
});

describe('getGuiControllerRuntime', () => {
  it('returns the exact runtime identity', () => {
    const runtime = createGuiControllerRuntime({});
    expect(getGuiControllerRuntime(createGuiController<Entity, typeof runtime>(runtime))).toBe(runtime);
  });
});

describe('getGuiLength', () => {
  it('reads the requested bounded axis', () => {
    const node = createGuiTestNode(30, 40);
    expect([getGuiLength(node, 'horizontal'), getGuiLength(node, 'vertical')]).toEqual([30, 40]);
  });
});

describe('getGuiPosition', () => {
  it('reads the requested transform axis', () => {
    const node = createGuiTestNode();
    node.x = 3;
    node.y = 4;
    expect([getGuiPosition(node, 'horizontal'), getGuiPosition(node, 'vertical')]).toEqual([3, 4]);
  });
});

describe('setGuiPosition', () => {
  it('sets one axis', () => {
    const runtime = createGuiControllerRuntime({});
    const node = createGuiTestNode();
    setGuiPosition(runtime, node, 'vertical', 5);
    expect(node.y).toBe(5);
  });
});

describe('setGuiScale', () => {
  it('sets one scale axis', () => {
    const runtime = createGuiControllerRuntime({});
    const node = createGuiTestNode();
    setGuiScale(runtime, node, 'horizontal', 0.5);
    expect(node.scaleX).toBe(0.5);
  });
});

describe('setGuiVisible', () => {
  it('sets visibility directly by default', () => {
    const runtime = createGuiControllerRuntime({});
    const node = createGuiTestNode();
    setGuiVisible(runtime, node, false);
    expect(node.visible).toBe(false);
  });
});

describe('setGuiVisualProperty', () => {
  it('offers intermediate writes to an opt-in transition', () => {
    const node = createGuiTestNode();
    const runtime = createGuiControllerRuntime({}, { run: (request) => request.apply(0.5) });
    setGuiVisualProperty(runtime, node, 'alpha', 0);
    expect(node.alpha).toBe(0.5);
  });
});

describe('snapGuiValue', () => {
  it('snaps around the minimum', () => {
    expect(snapGuiValue(3.1, 1, 2)).toBe(3);
    expect(snapGuiValue(3.1, 1, null)).toBe(3.1);
  });
});
