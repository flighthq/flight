import { connectSignal } from '@flighthq/signals/contract';

import { createGuiTestNode, emitGuiKeyboard, emitGuiPointer } from './guiTestHelper';
import {
  createListController,
  disposeListController,
  getListControllerSelectedIndex,
  getListControllerSignals,
  setListControllerSelectedIndex,
  setListControllerVisible,
} from './listController';

describe('createListController', () => {
  it('selects and activates item visuals', () => {
    const items = [createGuiTestNode(), createGuiTestNode()];
    const controller = createListController({ content: createGuiTestNode(), items, viewport: createGuiTestNode() });
    const activations: number[] = [];
    connectSignal(getListControllerSignals(controller).onActivate, (index) => activations.push(index));
    emitGuiPointer(items[1], 'onClick');
    emitGuiPointer(items[1], 'onDoubleClick');
    expect(getListControllerSelectedIndex(controller)).toBe(1);
    expect(activations).toEqual([1]);
  });

  it('supports hierarchical-independent flat keyboard navigation', () => {
    const viewport = createGuiTestNode();
    const controller = createListController({
      content: createGuiTestNode(),
      items: [createGuiTestNode(), createGuiTestNode()],
      viewport,
    });
    emitGuiKeyboard(viewport, 'onKeyDown', 'ArrowDown');
    expect(getListControllerSelectedIndex(controller)).toBe(0);
  });
});

describe('disposeListController', () => {
  it('detaches item input', () => {
    const item = createGuiTestNode();
    const controller = createListController({
      content: createGuiTestNode(),
      items: [item],
      viewport: createGuiTestNode(),
    });
    disposeListController(controller);
    emitGuiPointer(item, 'onClick');
    expect(getListControllerSelectedIndex(controller)).toBe(-1);
  });
});

describe('getListControllerSelectedIndex', () => {
  it('normalizes invalid initial values', () => {
    expect(
      getListControllerSelectedIndex(
        createListController({
          content: createGuiTestNode(),
          items: [],
          selectedIndex: 2,
          viewport: createGuiTestNode(),
        }),
      ),
    ).toBe(-1);
  });
});

describe('getListControllerSignals', () => {
  it('returns stable signals', () => {
    const controller = createListController({ content: createGuiTestNode(), items: [], viewport: createGuiTestNode() });
    expect(getListControllerSignals(controller)).toBe(getListControllerSignals(controller));
  });
});

describe('setListControllerSelectedIndex', () => {
  it('emits only real changes', () => {
    const controller = createListController({
      content: createGuiTestNode(),
      items: [createGuiTestNode()],
      viewport: createGuiTestNode(),
    });
    const values: number[] = [];
    connectSignal(getListControllerSignals(controller).onSelect, (index) => values.push(index));
    setListControllerSelectedIndex(controller, 0);
    setListControllerSelectedIndex(controller, 0);
    expect(values).toEqual([0]);
  });
});

describe('setListControllerVisible', () => {
  it('changes both list-owned references without creating visuals', () => {
    const content = createGuiTestNode();
    const viewport = createGuiTestNode();
    const controller = createListController({ content, items: [], viewport });
    setListControllerVisible(controller, false);
    expect([content.visible, viewport.visible]).toEqual([false, false]);
  });
});
