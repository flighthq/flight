import { connectSignal } from '@flighthq/signals/contract';

import { createGuiTestNode, emitGuiPointer } from './guiTestHelper';
import {
  createToggleController,
  disposeToggleController,
  getToggleControllerSignals,
  isToggleControllerChecked,
  setToggleControllerChecked,
} from './toggleController';

describe('createToggleController', () => {
  it('toggles through either state visual and an optional label', () => {
    const unchecked = createGuiTestNode();
    const checked = createGuiTestNode();
    const label = createGuiTestNode();
    const controller = createToggleController({ checkedState: checked, label, uncheckedState: unchecked });
    emitGuiPointer(label, 'onClick');
    expect(isToggleControllerChecked(controller)).toBe(true);
    expect([unchecked.visible, checked.visible]).toEqual([false, true]);
  });
});

describe('disposeToggleController', () => {
  it('detaches click listeners', () => {
    const unchecked = createGuiTestNode();
    const controller = createToggleController({ checkedState: createGuiTestNode(), uncheckedState: unchecked });
    disposeToggleController(controller);
    emitGuiPointer(unchecked, 'onClick');
    expect(isToggleControllerChecked(controller)).toBe(false);
  });
});

describe('getToggleControllerSignals', () => {
  it('emits only real state changes', () => {
    const controller = createToggleController({
      checkedState: createGuiTestNode(),
      uncheckedState: createGuiTestNode(),
    });
    const values: boolean[] = [];
    connectSignal(getToggleControllerSignals(controller).onChange, (value) => values.push(value));
    setToggleControllerChecked(controller, true);
    setToggleControllerChecked(controller, true);
    expect(values).toEqual([true]);
  });
});

describe('isToggleControllerChecked', () => {
  it('reads the current value', () => {
    expect(
      isToggleControllerChecked(
        createToggleController({
          checked: true,
          checkedState: createGuiTestNode(),
          uncheckedState: createGuiTestNode(),
        }),
      ),
    ).toBe(true);
  });
});

describe('setToggleControllerChecked', () => {
  it('sets both directions', () => {
    const controller = createToggleController({
      checked: true,
      checkedState: createGuiTestNode(),
      uncheckedState: createGuiTestNode(),
    });
    setToggleControllerChecked(controller, false);
    expect(isToggleControllerChecked(controller)).toBe(false);
  });
});
