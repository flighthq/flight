import type { InputText, InputTextData, InputTextRuntime, MethodsOf, PartialNode } from '@flighthq/types';
import { InputTextKind } from '@flighthq/types';

import { createDisplayObjectGeneric, createDisplayObjectRuntime, getDisplayObjectRuntime } from './displayObject';
import { computeRichTextLocalBoundsRectangle, createRichTextData } from './richText';

export function createInputText(obj?: Readonly<PartialNode<InputText>>): InputText {
  return createDisplayObjectGeneric(InputTextKind, obj, createInputTextData, createInputTextRuntime) as InputText;
}

export function createInputTextData(data?: Readonly<Partial<InputTextData>>): InputTextData {
  const _data = createRichTextData(data) as InputTextData;
  _data.alwaysShowSelection = data?.alwaysShowSelection ?? false;
  _data.displayAsPassword = data?.displayAsPassword ?? false;
  _data.passwordCharacter = data?.passwordCharacter ?? '\u2022';
  _data.restrict = data?.restrict ?? '';
  _data.selectionAlpha = data?.selectionAlpha ?? 0.35;
  _data.selectionColor = data?.selectionColor ?? 0x0078d7;
  return _data;
}

export function createInputTextRuntime(): InputTextRuntime {
  const out = createDisplayObjectRuntime(defaultMethods) as InputTextRuntime;
  out.caretIndex = 0;
  out.focused = false;
  out.selectionIndex = 0;
  out.textLayout = null;
  out.richTextContent = null;
  return out;
}

export function getInputTextRuntime(source: Readonly<InputText>): Readonly<InputTextRuntime> {
  return getDisplayObjectRuntime(source) as InputTextRuntime;
}

const defaultMethods: Partial<MethodsOf<InputTextRuntime>> = {
  computeLocalBoundsRect: computeRichTextLocalBoundsRectangle,
};
