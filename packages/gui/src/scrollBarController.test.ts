import { connectSignal } from '@flighthq/signals/contract';

import { createGuiTestNode, emitGuiPointer } from './guiTestHelper';
import {
  createScrollBarController,
  disposeScrollBarController,
  getScrollBarControllerSignals,
  getScrollBarControllerValue,
  setScrollBarControllerValue,
} from './scrollBarController';

describe('createScrollBarController', () => {
  it('pages on track clicks and positions the thumb', () => {
    const track = createGuiTestNode(20, 100);
    const thumb = createGuiTestNode(20, 10);
    const controller = createScrollBarController({ maximum: 100, pageSize: 20, thumb, track });
    emitGuiPointer(track, 'onPointerDown', { localY: 80 });
    expect(getScrollBarControllerValue(controller)).toBe(20);
    expect(thumb.y).toBe(18);
  });

  it('repeat-clicks optional line buttons and cancels the timer', () => {
    vi.useFakeTimers();
    const down = createGuiTestNode();
    const controller = createScrollBarController({
      downButton: down,
      maximum: 10,
      thumb: createGuiTestNode(),
      track: createGuiTestNode(),
    });
    emitGuiPointer(down, 'onPointerDown');
    vi.advanceTimersByTime(250);
    emitGuiPointer(down, 'onPointerUp');
    expect(getScrollBarControllerValue(controller)).toBe(3);
    vi.useRealTimers();
  });
});

describe('disposeScrollBarController', () => {
  it('cancels repeat timers', () => {
    vi.useFakeTimers();
    const down = createGuiTestNode();
    const controller = createScrollBarController({
      downButton: down,
      thumb: createGuiTestNode(),
      track: createGuiTestNode(),
    });
    emitGuiPointer(down, 'onPointerDown');
    disposeScrollBarController(controller);
    vi.advanceTimersByTime(500);
    expect(getScrollBarControllerValue(controller)).toBe(1);
    vi.useRealTimers();
  });
});

describe('getScrollBarControllerSignals', () => {
  it('emits changes', () => {
    const controller = createScrollBarController({ thumb: createGuiTestNode(), track: createGuiTestNode() });
    const values: number[] = [];
    connectSignal(getScrollBarControllerSignals(controller).onChange, (value) => values.push(value));
    setScrollBarControllerValue(controller, 5);
    expect(values).toEqual([5]);
  });
});

describe('getScrollBarControllerValue', () => {
  it('returns the initial value', () => {
    expect(
      getScrollBarControllerValue(
        createScrollBarController({ thumb: createGuiTestNode(), track: createGuiTestNode(), value: 5 }),
      ),
    ).toBe(5);
  });
});

describe('setScrollBarControllerValue', () => {
  it('clamps values', () => {
    const controller = createScrollBarController({
      maximum: 10,
      thumb: createGuiTestNode(),
      track: createGuiTestNode(),
    });
    setScrollBarControllerValue(controller, 20);
    expect(getScrollBarControllerValue(controller)).toBe(10);
  });
});
