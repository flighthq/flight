import { createRichText } from '@flighthq/displayobject';

import { disableTextInput, enableTextInput, getTextInputState, hasTextInput } from './textInput';

describe('disableTextInput', () => {
  it('detaches the input slot', () => {
    const node = createRichText();
    enableTextInput(node);
    disableTextInput(node);
    expect(hasTextInput(node)).toBe(false);
    expect(getTextInputState(node)).toBeNull();
  });
});

describe('enableTextInput', () => {
  it('allocates the input slot with default state', () => {
    const node = createRichText();
    const state = enableTextInput(node);
    expect(state.focused).toBe(false);
    expect(state.caretIndex).toBe(0);
    expect(state.displayAsPassword).toBe(false);
    expect(state.selectionColor).toBe(0x0078d7);
  });

  it('applies authoring options', () => {
    const node = createRichText();
    const state = enableTextInput(node, { displayAsPassword: true, selectionColor: 0xff0000 });
    expect(state.displayAsPassword).toBe(true);
    expect(state.selectionColor).toBe(0xff0000);
  });

  it('is idempotent and returns the existing state, applying new options', () => {
    const node = createRichText();
    const first = enableTextInput(node);
    const second = enableTextInput(node, { displayAsPassword: true });
    expect(second).toBe(first);
    expect(second.displayAsPassword).toBe(true);
  });
});

describe('getTextInputState', () => {
  it('returns null on a static RichText', () => {
    const node = createRichText();
    expect(getTextInputState(node)).toBeNull();
  });

  it('returns the slot once enabled', () => {
    const node = createRichText();
    const state = enableTextInput(node);
    expect(getTextInputState(node)).toBe(state);
  });
});

describe('hasTextInput', () => {
  it('is false until enabled and true after', () => {
    const node = createRichText();
    expect(hasTextInput(node)).toBe(false);
    enableTextInput(node);
    expect(hasTextInput(node)).toBe(true);
  });
});
