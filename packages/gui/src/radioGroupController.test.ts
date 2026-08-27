import { connectSignal } from '@flighthq/signals/contract';

import { createGuiTestNode } from './guiTestHelper';
import {
  createRadioGroupController,
  disposeRadioGroupController,
  getRadioGroupControllerSelectedIndex,
  getRadioGroupControllerSignals,
  setRadioGroupControllerSelectedIndex,
} from './radioGroupController';
import { createToggleController, isToggleControllerChecked, setToggleControllerChecked } from './toggleController';

function toggle() {
  return createToggleController({ checkedState: createGuiTestNode(), uncheckedState: createGuiTestNode() });
}

describe('createRadioGroupController', () => {
  it('enforces mutual exclusion from toggle changes', () => {
    const toggles = [toggle(), toggle(), toggle()];
    const controller = createRadioGroupController({ selectedIndex: 0, toggles });
    setToggleControllerChecked(toggles[2], true);
    expect(getRadioGroupControllerSelectedIndex(controller)).toBe(2);
    expect(toggles.map(isToggleControllerChecked)).toEqual([false, false, true]);
  });
});

describe('disposeRadioGroupController', () => {
  it('stops observing member toggles', () => {
    const member = toggle();
    const controller = createRadioGroupController({ selectedIndex: -1, toggles: [member] });
    disposeRadioGroupController(controller);
    setToggleControllerChecked(member, true);
    expect(getRadioGroupControllerSelectedIndex(controller)).toBe(-1);
  });
});

describe('getRadioGroupControllerSelectedIndex', () => {
  it('normalizes out-of-range values to -1', () => {
    expect(
      getRadioGroupControllerSelectedIndex(createRadioGroupController({ selectedIndex: 4, toggles: [toggle()] })),
    ).toBe(-1);
  });
});

describe('getRadioGroupControllerSignals', () => {
  it('emits selected indices', () => {
    const controller = createRadioGroupController({ toggles: [toggle(), toggle()] });
    const values: number[] = [];
    connectSignal(getRadioGroupControllerSignals(controller).onChange, (value) => values.push(value));
    setRadioGroupControllerSelectedIndex(controller, 1);
    expect(values).toEqual([1]);
  });
});

describe('setRadioGroupControllerSelectedIndex', () => {
  it('can clear the selection', () => {
    const controller = createRadioGroupController({ toggles: [toggle()] });
    setRadioGroupControllerSelectedIndex(controller, -1);
    expect(getRadioGroupControllerSelectedIndex(controller)).toBe(-1);
  });
});
