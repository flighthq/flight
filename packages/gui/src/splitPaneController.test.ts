import { connectSignal } from '@flighthq/signals/contract';

import { createGuiTestNode, emitGuiPointer } from './guiTestHelper';
import {
  createSplitPaneController,
  disposeSplitPaneController,
  getSplitPaneControllerPosition,
  getSplitPaneControllerSignals,
  setSplitPaneControllerPosition,
} from './splitPaneController';

describe('createSplitPaneController', () => {
  it('drags a distinct constrained divider behavior', () => {
    const first = createGuiTestNode(100, 20);
    const divider = createGuiTestNode(10, 20);
    const second = createGuiTestNode(100, 20);
    const controller = createSplitPaneController({
      divider,
      firstRegion: first,
      minimumFirst: 50,
      minimumSecond: 50,
      secondRegion: second,
      totalSize: 210,
    });
    emitGuiPointer(divider, 'onPointerDown', { worldX: 100 });
    emitGuiPointer(divider, 'onPointerMove', { worldX: 170 });
    expect(getSplitPaneControllerPosition(controller)).toBe(150);
    expect(divider.x).toBe(150);
  });
});

describe('disposeSplitPaneController', () => {
  it('detaches divider dragging', () => {
    const divider = createGuiTestNode();
    const controller = createSplitPaneController({
      divider,
      firstRegion: createGuiTestNode(),
      secondRegion: createGuiTestNode(),
    });
    disposeSplitPaneController(controller);
    emitGuiPointer(divider, 'onPointerDown', { worldX: 0 });
    emitGuiPointer(divider, 'onPointerMove', { worldX: 50 });
    expect(getSplitPaneControllerPosition(controller)).toBe(100);
  });
});

describe('getSplitPaneControllerPosition', () => {
  it('returns the clamped initial position', () => {
    const controller = createSplitPaneController({
      divider: createGuiTestNode(),
      firstRegion: createGuiTestNode(),
      minimumFirst: 20,
      position: 0,
      secondRegion: createGuiTestNode(),
    });
    expect(getSplitPaneControllerPosition(controller)).toBe(20);
  });
});

describe('getSplitPaneControllerSignals', () => {
  it('emits changed positions', () => {
    const controller = createSplitPaneController({
      divider: createGuiTestNode(),
      firstRegion: createGuiTestNode(),
      secondRegion: createGuiTestNode(),
    });
    const values: number[] = [];
    connectSignal(getSplitPaneControllerSignals(controller).onChange, (value) => values.push(value));
    setSplitPaneControllerPosition(controller, 50);
    expect(values).toEqual([50]);
  });
});

describe('setSplitPaneControllerPosition', () => {
  it('honors the maximum', () => {
    const controller = createSplitPaneController({
      divider: createGuiTestNode(),
      firstRegion: createGuiTestNode(),
      maximumFirst: 60,
      secondRegion: createGuiTestNode(),
    });
    setSplitPaneControllerPosition(controller, 90);
    expect(getSplitPaneControllerPosition(controller)).toBe(60);
  });
});
