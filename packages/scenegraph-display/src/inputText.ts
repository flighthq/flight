import type { InputText, InputTextData, InputTextRuntime, MethodsOf, PartialNode } from '@flighthq/types';
import { InputTextKind } from '@flighthq/types';

import { createDisplayObjectGeneric, createDisplayObjectRuntime, getDisplayObjectRuntime } from './displayObject';
import { computeRichTextLocalBoundsRect, createRichTextData } from './richText';

export function createInputText(obj?: Readonly<PartialNode<InputText>>): InputText {
  return createDisplayObjectGeneric(InputTextKind, obj, createInputTextData, createInputTextRuntime) as InputText;
}

export function createInputTextData(data?: Readonly<Partial<InputTextData>>): InputTextData {
  const _data = createRichTextData(data) as InputTextData;
  _data.displayAsPassword = data?.displayAsPassword ?? false;
  _data.restrict = data?.restrict ?? '';
  return _data;
}

export function createInputTextRuntime(): InputTextRuntime {
  return createDisplayObjectRuntime(defaultMethods) as InputTextRuntime;
}

export function getInputTextRuntime(source: Readonly<InputText>): Readonly<InputTextRuntime> {
  return getDisplayObjectRuntime(source) as InputTextRuntime;
}

const defaultMethods: Partial<MethodsOf<InputTextRuntime>> = {
  computeLocalBoundsRect: computeRichTextLocalBoundsRect,
};
