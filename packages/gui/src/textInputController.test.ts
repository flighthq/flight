import { connectSignal } from '@flighthq/signals/contract';
import { createRichText, getRichTextRuntime, getTextLayoutResult, setTextLayoutResult } from '@flighthq/text/contract';
import {
  createTextInputManager,
  getTextInputSelectionBeginIndex,
  getTextInputSelectionEndIndex,
} from '@flighthq/textinput/contract';

import { createGuiTestNode, emitGuiPointer } from './guiTestHelper.ts';
import {
  blurTextInputController,
  createTextInputController,
  dispatchTextInputControllerKeyDown,
  dispatchTextInputControllerText,
  disposeTextInputController,
  focusTextInputController,
  getTextInputControllerSignals,
} from './textInputController.ts';

describe('blurTextInputController', () => {
  it('hides a caller caret', () => {
    const caret = createGuiTestNode();
    const controller = createTextInputController({ caret, textField: createRichText() });
    focusTextInputController(controller);
    blurTextInputController(controller);
    expect(caret.visible).toBe(false);
  });
});

describe('createTextInputController', () => {
  it('wraps textinput and relays text changes', () => {
    const field = createRichText();
    const controller = createTextInputController({ textField: field });
    const values: string[] = [];
    connectSignal(getTextInputControllerSignals(controller).onChange, (text) => values.push(text));
    focusTextInputController(controller);
    dispatchTextInputControllerText(controller, 'abc');
    expect(field.data.text).toBe('abc');
    expect(values).toEqual(['abc']);
  });

  it('routes editing through a caller-supplied manager', () => {
    const field = createRichText();
    const manager = createTextInputManager();
    const controller = createTextInputController({ manager, textField: field });
    focusTextInputController(controller);
    expect(manager.focused).toBe(field);
  });

  it('treats pointer down as a single click that places a collapsed caret', () => {
    const field = createRichText();
    const manager = createTextInputManager();
    createTextInputController({ manager, textField: field });
    field.data.text = 'hello world';
    setTextLayoutResult(field, getTextLayoutResult(getRichTextRuntime(field)));
    emitGuiPointer(field, 'onPointerDown', { localX: 10, localY: 5 });
    expect(manager.focused).toBe(field);
    expect(getTextInputSelectionBeginIndex(field)).toBe(0);
    expect(getTextInputSelectionEndIndex(field)).toBe(0);
  });
});

describe('dispatchTextInputControllerKeyDown', () => {
  it('emits submit on Enter', () => {
    const controller = createTextInputController({ textField: createRichText() });
    let submitted = '';
    connectSignal(getTextInputControllerSignals(controller).onSubmit, (text) => (submitted = text));
    focusTextInputController(controller);
    dispatchTextInputControllerText(controller, 'abc');
    dispatchTextInputControllerKeyDown(controller, {
      altKey: false,
      capsLock: false,
      code: 'Enter',
      ctrlKey: false,
      key: 'Enter',
      keyCode: 13,
      location: 0,
      metaKey: false,
      modifier: 0,
      numLock: false,
      repeat: false,
      shiftKey: false,
      timeStamp: 0,
    });
    expect(submitted).toBe('abc');
  });
});

describe('dispatchTextInputControllerText', () => {
  it('returns false while unfocused', () => {
    const controller = createTextInputController({ textField: createRichText() });
    expect(dispatchTextInputControllerText(controller, 'x')).toBe(false);
  });
});

describe('disposeTextInputController', () => {
  it('releases owned text-input capability', () => {
    const controller = createTextInputController({ textField: createRichText() });
    disposeTextInputController(controller);
    expect(dispatchTextInputControllerText(controller, 'x')).toBe(false);
  });
});

describe('focusTextInputController', () => {
  it('shows a caller caret', () => {
    const caret = createGuiTestNode();
    const controller = createTextInputController({ caret, textField: createRichText() });
    focusTextInputController(controller);
    expect(caret.visible).toBe(true);
  });
});

describe('getTextInputControllerSignals', () => {
  it('returns a stable group', () => {
    const controller = createTextInputController({ textField: createRichText() });
    expect(getTextInputControllerSignals(controller)).toBe(getTextInputControllerSignals(controller));
  });
});
