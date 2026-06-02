import type { InputText, PartialNode } from '@flighthq/types';
import { InputTextKind } from '@flighthq/types';

import { createInputText, createInputTextData, createInputTextRuntime, getInputTextRuntime } from './inputText';

describe('createInputText', () => {
  let text: InputText;

  beforeEach(() => {
    text = createInputText();
  });

  it('initializes default values', () => {
    expect(text.data.text).toBe('');
    expect(text.data.autoSize).toBe('none');
    expect(text.kind).toStrictEqual(InputTextKind);
  });

  it('allows pre-defined values', () => {
    const base: PartialNode<InputText> = {
      data: {
        text: 'foofoo',
        autoSize: 'center',
      },
    };
    const obj = createInputText(base);
    expect(obj.data.text).toStrictEqual(base.data!.text);
    expect(obj.data.autoSize).toStrictEqual(base.data!.autoSize);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createInputText(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('createInputTextData', () => {
  it('returns default values', () => {
    const data = createInputTextData();
    expect(data.displayAsPassword).toBe(false);
    expect(data.passwordCharacter).toBe('\u2022');
    expect(data.restrict).toBe('');
    expect(data.text).toBe('');
    expect(data.htmlText).toBe('');
  });

  it('allows pre-defined values', () => {
    const data = createInputTextData({ displayAsPassword: true, passwordCharacter: '*', restrict: 'A-Z' });
    expect(data.displayAsPassword).toBe(true);
    expect(data.passwordCharacter).toBe('*');
    expect(data.restrict).toBe('A-Z');
  });
});

describe('createInputTextRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createInputTextRuntime();
    expect(runtime).not.toBeNull();
  });

  it('starts without attached layout runtime state', () => {
    const runtime = createInputTextRuntime();
    expect(runtime.textLayout).toBeNull();
  });

  it('starts without attached content runtime state', () => {
    const runtime = createInputTextRuntime();
    expect(runtime.richTextContent).toBeNull();
  });

  it('starts with a collapsed selection', () => {
    const runtime = createInputTextRuntime();
    expect(runtime.caretIndex).toBe(0);
    expect(runtime.selectionIndex).toBe(0);
  });

  it('starts without focus', () => {
    const runtime = createInputTextRuntime();
    expect(runtime.focused).toBe(false);
  });
});

describe('getInputTextRuntime', () => {
  it('returns the runtime for an InputText', () => {
    const text = createInputText();
    const runtime = getInputTextRuntime(text);
    expect(runtime).not.toBeNull();
  });
});
