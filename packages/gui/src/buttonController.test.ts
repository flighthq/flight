import { connectSignal } from '@flighthq/signals/contract';

import {
  createButtonController,
  disposeButtonController,
  getButtonControllerSignals,
  isButtonControllerDisabled,
  setButtonControllerDisabled,
} from './buttonController';
import { createGuiTestNode, emitGuiPointer } from './guiTestHelper';

describe('createButtonController', () => {
  it('drives optional states and emits the complete pointer lifecycle', () => {
    const up = createGuiTestNode();
    const over = createGuiTestNode();
    const down = createGuiTestNode();
    const controller = createButtonController({ downState: down, overState: over, upState: up });
    const events: string[] = [];
    const signals = getButtonControllerSignals(controller);
    connectSignal(signals.onPress, () => events.push('press'));
    connectSignal(signals.onRelease, () => events.push('release'));
    connectSignal(signals.onClick, () => events.push('click'));

    emitGuiPointer(up, 'onPointerOver');
    expect([up.visible, over.visible, down.visible]).toEqual([false, true, false]);
    emitGuiPointer(up, 'onPointerDown');
    expect([up.visible, over.visible, down.visible]).toEqual([false, false, true]);
    emitGuiPointer(up, 'onPointerUp');
    emitGuiPointer(up, 'onClick');
    expect(events).toEqual(['press', 'release', 'click']);
  });

  it('delegates property assignment only when a transition is supplied', () => {
    const up = createGuiTestNode();
    const over = createGuiTestNode();
    const applies: Array<() => void> = [];
    createButtonController({
      overState: over,
      transition: { run: (request) => applies.push(() => request.apply()) },
      upState: up,
    });
    for (const apply of applies.splice(0)) apply();
    expect([up.visible, over.visible]).toEqual([true, false]);

    emitGuiPointer(up, 'onPointerOver');
    expect([up.visible, over.visible]).toEqual([true, false]);
    for (const apply of applies.splice(0)) apply();
    expect([up.visible, over.visible]).toEqual([false, true]);
  });
});

describe('disposeButtonController', () => {
  it('detaches listeners idempotently', () => {
    const up = createGuiTestNode();
    const controller = createButtonController({ upState: up });
    let clicks = 0;
    connectSignal(getButtonControllerSignals(controller).onClick, () => clicks++);
    disposeButtonController(controller);
    disposeButtonController(controller);
    emitGuiPointer(up, 'onClick');
    expect(clicks).toBe(0);
  });
});

describe('getButtonControllerSignals', () => {
  it('returns a stable signal group', () => {
    const controller = createButtonController({ upState: createGuiTestNode() });
    expect(getButtonControllerSignals(controller)).toBe(getButtonControllerSignals(controller));
  });
});

describe('isButtonControllerDisabled', () => {
  it('reads the configured state', () => {
    expect(isButtonControllerDisabled(createButtonController({ disabled: true, upState: createGuiTestNode() }))).toBe(
      true,
    );
  });
});

describe('setButtonControllerDisabled', () => {
  it('blocks click emission', () => {
    const up = createGuiTestNode();
    const controller = createButtonController({ upState: up });
    let clicks = 0;
    connectSignal(getButtonControllerSignals(controller).onClick, () => clicks++);
    setButtonControllerDisabled(controller, true);
    emitGuiPointer(up, 'onClick');
    expect(clicks).toBe(0);
  });
});
