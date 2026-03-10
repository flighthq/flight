import type { InputText, PartialWithData } from '@flighthq/types';
import { InputTextKind } from '@flighthq/types';

import { createInputText } from './inputText';

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
    const base: PartialWithData<InputText> = {
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
