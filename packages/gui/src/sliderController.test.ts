import { connectSignal } from '@flighthq/signals/contract';

import { createGuiTestNode, emitGuiKeyboard, emitGuiPointer } from './guiTestHelper';
import {
  createSliderController,
  disposeSliderController,
  getSliderControllerSignals,
  getSliderControllerValue,
  setSliderControllerValue,
} from './sliderController';

describe('createSliderController', () => {
  it('maps track positions and thumb drags to values', () => {
    const track = createGuiTestNode(100, 10);
    const thumb = createGuiTestNode(10, 10);
    const controller = createSliderController({ maximum: 10, thumb, track });
    emitGuiPointer(track, 'onPointerDown', { localX: 50 });
    expect(getSliderControllerValue(controller)).toBe(5);
    expect(thumb.x).toBe(45);
    emitGuiPointer(thumb, 'onPointerDown', { worldX: 45 });
    emitGuiPointer(thumb, 'onPointerMove', { worldX: 90 });
    expect(getSliderControllerValue(controller)).toBe(10);
  });

  it('supports keyboard selection', () => {
    const track = createGuiTestNode();
    const controller = createSliderController({ maximum: 10, step: 2, thumb: createGuiTestNode(), track });
    emitGuiKeyboard(track, 'onKeyDown', 'ArrowRight');
    expect(getSliderControllerValue(controller)).toBe(2);
  });
});

describe('disposeSliderController', () => {
  it('detaches track input', () => {
    const track = createGuiTestNode();
    const controller = createSliderController({ thumb: createGuiTestNode(), track });
    disposeSliderController(controller);
    emitGuiPointer(track, 'onPointerDown', { localX: 100 });
    expect(getSliderControllerValue(controller)).toBe(0);
  });
});

describe('getSliderControllerSignals', () => {
  it('emits snapped values', () => {
    const controller = createSliderController({
      maximum: 10,
      step: 2,
      thumb: createGuiTestNode(),
      track: createGuiTestNode(),
    });
    const values: number[] = [];
    connectSignal(getSliderControllerSignals(controller).onChange, (value) => values.push(value));
    setSliderControllerValue(controller, 3);
    expect(values).toEqual([4]);
  });
});

describe('getSliderControllerValue', () => {
  it('returns the configured value', () => {
    expect(
      getSliderControllerValue(
        createSliderController({ thumb: createGuiTestNode(), track: createGuiTestNode(), value: 0.5 }),
      ),
    ).toBe(0.5);
  });
});

describe('setSliderControllerValue', () => {
  it('clamps to the range', () => {
    const controller = createSliderController({ thumb: createGuiTestNode(), track: createGuiTestNode() });
    setSliderControllerValue(controller, 5);
    expect(getSliderControllerValue(controller)).toBe(1);
  });
});
