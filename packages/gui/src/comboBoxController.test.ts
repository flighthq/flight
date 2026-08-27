import { connectSignal } from '@flighthq/signals/contract';

import { createButtonController } from './buttonController';
import {
  createComboBoxController,
  disposeComboBoxController,
  getComboBoxControllerSignals,
  isComboBoxControllerOpen,
  setComboBoxControllerOpen,
} from './comboBoxController';
import { createGuiTestNode, emitGuiPointer } from './guiTestHelper';
import { createListController } from './listController';

function parts() {
  const buttonNode = createGuiTestNode();
  const viewport = createGuiTestNode();
  const item = createGuiTestNode();
  return {
    button: createButtonController({ upState: buttonNode }),
    buttonNode,
    item,
    list: createListController({ content: createGuiTestNode(), items: [item], viewport }),
    viewport,
  };
}

describe('createComboBoxController', () => {
  it('opens from its button and closes on list selection', () => {
    const p = parts();
    const controller = createComboBoxController(p);
    emitGuiPointer(p.buttonNode, 'onClick');
    expect(isComboBoxControllerOpen(controller)).toBe(true);
    emitGuiPointer(p.item, 'onClick');
    expect(isComboBoxControllerOpen(controller)).toBe(false);
  });
});

describe('disposeComboBoxController', () => {
  it('detaches composed controller signals', () => {
    const p = parts();
    const controller = createComboBoxController(p);
    disposeComboBoxController(controller);
    emitGuiPointer(p.buttonNode, 'onClick');
    expect(isComboBoxControllerOpen(controller)).toBe(false);
  });
});

describe('getComboBoxControllerSignals', () => {
  it('emits open-state transitions', () => {
    const controller = createComboBoxController(parts());
    const values: boolean[] = [];
    connectSignal(getComboBoxControllerSignals(controller).onOpenChange, (open) => values.push(open));
    setComboBoxControllerOpen(controller, true);
    expect(values).toEqual([true]);
  });
});

describe('isComboBoxControllerOpen', () => {
  it('reads initial open state', () => {
    expect(isComboBoxControllerOpen(createComboBoxController({ ...parts(), open: true }))).toBe(true);
  });
});

describe('setComboBoxControllerOpen', () => {
  it('updates list visibility', () => {
    const p = parts();
    const controller = createComboBoxController(p);
    setComboBoxControllerOpen(controller, true);
    expect(p.viewport.visible).toBe(true);
  });
});
