import { connectSignal } from '@flighthq/signals/contract';

import { createButtonController } from './buttonController';
import { createGuiTestNode, emitGuiPointer } from './guiTestHelper';
import {
  createWindowController,
  disposeWindowController,
  getWindowControllerSignals,
  setWindowControllerPosition,
  setWindowControllerSize,
} from './windowController';

describe('createWindowController', () => {
  it('moves from a title bar and resizes from a handle', () => {
    const frame = createGuiTestNode(200, 100);
    const titleBar = createGuiTestNode();
    const resizeHandle = createGuiTestNode();
    createWindowController({ frame, resizeHandle, titleBar });
    emitGuiPointer(titleBar, 'onPointerDown', { worldX: 10, worldY: 10 });
    emitGuiPointer(titleBar, 'onPointerMove', { worldX: 30, worldY: 40 });
    expect([frame.x, frame.y]).toEqual([20, 30]);
    emitGuiPointer(resizeHandle, 'onPointerDown', { worldX: 0, worldY: 0 });
    emitGuiPointer(resizeHandle, 'onPointerMove', { worldX: 100, worldY: 50 });
    expect([frame.scaleX, frame.scaleY]).toEqual([1.5, 1.5]);
  });

  it('forwards a composed close button', () => {
    const closeNode = createGuiTestNode();
    const controller = createWindowController({
      closeButton: createButtonController({ upState: closeNode }),
      frame: createGuiTestNode(),
    });
    let closed = false;
    connectSignal(getWindowControllerSignals(controller).onClose, () => (closed = true));
    emitGuiPointer(closeNode, 'onClick');
    expect(closed).toBe(true);
  });
});

describe('disposeWindowController', () => {
  it('detaches title dragging', () => {
    const frame = createGuiTestNode();
    const titleBar = createGuiTestNode();
    const controller = createWindowController({ frame, titleBar });
    disposeWindowController(controller);
    emitGuiPointer(titleBar, 'onPointerDown', { worldX: 0 });
    emitGuiPointer(titleBar, 'onPointerMove', { worldX: 20 });
    expect(frame.x).toBe(0);
  });
});

describe('getWindowControllerSignals', () => {
  it('returns stable signals', () => {
    const controller = createWindowController({ frame: createGuiTestNode() });
    expect(getWindowControllerSignals(controller)).toBe(getWindowControllerSignals(controller));
  });
});

describe('setWindowControllerPosition', () => {
  it('sets the frame transform', () => {
    const frame = createGuiTestNode();
    const controller = createWindowController({ frame });
    setWindowControllerPosition(controller, 4, 5);
    expect([frame.x, frame.y]).toEqual([4, 5]);
  });
});

describe('setWindowControllerSize', () => {
  it('honors minimum dimensions', () => {
    const frame = createGuiTestNode(100, 100);
    const controller = createWindowController({ frame, minimumHeight: 50, minimumWidth: 50 });
    setWindowControllerSize(controller, 10, 20);
    expect([frame.scaleX, frame.scaleY]).toEqual([0.5, 0.5]);
  });
});
