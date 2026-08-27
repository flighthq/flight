import { connectSignal } from '@flighthq/signals/contract';

import { createGuiTestNode, emitGuiPointer } from './guiTestHelper';
import {
  createScrollViewController,
  disposeScrollViewController,
  getScrollViewControllerSignals,
  getScrollViewControllerX,
  getScrollViewControllerY,
  setScrollViewControllerPosition,
} from './scrollViewController';

describe('createScrollViewController', () => {
  it('pans content by drag and wheel within viewport bounds', () => {
    const viewport = createGuiTestNode(100, 100);
    const content = createGuiTestNode(300, 300);
    const controller = createScrollViewController({ content, viewport });
    emitGuiPointer(viewport, 'onPointerDown', { worldX: 50, worldY: 50 });
    emitGuiPointer(viewport, 'onPointerMove', { worldX: 20, worldY: 10 });
    expect([getScrollViewControllerX(controller), getScrollViewControllerY(controller)]).toEqual([30, 40]);
    emitGuiPointer(viewport, 'onWheel', { deltaY: 20 });
    expect(content.y).toBe(-60);
  });
});

describe('disposeScrollViewController', () => {
  it('detaches viewport input', () => {
    const viewport = createGuiTestNode(100, 100);
    const controller = createScrollViewController({ content: createGuiTestNode(200, 200), viewport });
    disposeScrollViewController(controller);
    emitGuiPointer(viewport, 'onWheel', { deltaY: 50 });
    expect(getScrollViewControllerY(controller)).toBe(0);
  });
});

describe('getScrollViewControllerSignals', () => {
  it('emits both axes', () => {
    const controller = createScrollViewController({
      content: createGuiTestNode(200, 200),
      viewport: createGuiTestNode(),
    });
    const values: number[][] = [];
    connectSignal(getScrollViewControllerSignals(controller).onScroll, (x, y) => values.push([x, y]));
    setScrollViewControllerPosition(controller, 10, 20);
    expect(values).toEqual([[10, 20]]);
  });
});

describe('getScrollViewControllerX', () => {
  it('returns horizontal offset', () => {
    const controller = createScrollViewController({
      content: createGuiTestNode(200, 200),
      viewport: createGuiTestNode(),
    });
    setScrollViewControllerPosition(controller, 5, 0);
    expect(getScrollViewControllerX(controller)).toBe(5);
  });
});

describe('getScrollViewControllerY', () => {
  it('returns vertical offset', () => {
    const controller = createScrollViewController({
      content: createGuiTestNode(200, 200),
      viewport: createGuiTestNode(),
    });
    setScrollViewControllerPosition(controller, 0, 5);
    expect(getScrollViewControllerY(controller)).toBe(5);
  });
});

describe('setScrollViewControllerPosition', () => {
  it('clamps to content extent', () => {
    const controller = createScrollViewController({
      content: createGuiTestNode(150, 150),
      viewport: createGuiTestNode(100, 100),
    });
    setScrollViewControllerPosition(controller, 500, 500);
    expect([getScrollViewControllerX(controller), getScrollViewControllerY(controller)]).toEqual([50, 50]);
  });
});
