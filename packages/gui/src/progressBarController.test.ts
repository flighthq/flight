import { createGuiTestNode } from './guiTestHelper';
import {
  createProgressBarController,
  disposeProgressBarController,
  getProgressBarControllerValue,
  setProgressBarControllerValue,
} from './progressBarController';

describe('createProgressBarController', () => {
  it('scales the caller fill without changing the track', () => {
    const fill = createGuiTestNode();
    const track = createGuiTestNode();
    createProgressBarController({ fill, maximum: 100, track, value: 25 });
    expect(fill.scaleX).toBe(0.25);
    expect(track.scaleX).toBe(1);
  });
});

describe('disposeProgressBarController', () => {
  it('is idempotent', () => {
    const controller = createProgressBarController({ fill: createGuiTestNode(), track: createGuiTestNode() });
    disposeProgressBarController(controller);
    expect(() => disposeProgressBarController(controller)).not.toThrow();
  });
});

describe('getProgressBarControllerValue', () => {
  it('returns a clamped initial value', () => {
    expect(
      getProgressBarControllerValue(
        createProgressBarController({ fill: createGuiTestNode(), maximum: 10, track: createGuiTestNode(), value: 20 }),
      ),
    ).toBe(10);
  });
});

describe('setProgressBarControllerValue', () => {
  it('updates vertical fill scale', () => {
    const fill = createGuiTestNode();
    const controller = createProgressBarController({
      fill,
      maximum: 10,
      orientation: 'vertical',
      track: createGuiTestNode(),
    });
    setProgressBarControllerValue(controller, 5);
    expect(fill.scaleY).toBe(0.5);
  });
});
