import { type InputText, type InputTextData, InputTextKind, type PartialWithData } from '@flighthq/types';

import { createPrimitive } from './primitive';
import { createRichTextData } from './richText';

export function createInputText(obj?: PartialWithData<InputText>): InputText {
  return createPrimitive<InputText, InputTextData>(InputTextKind, obj, createInputTextData);
}

export function createInputTextData(data?: Partial<InputTextData>): InputTextData {
  const _data = createRichTextData(data) as InputTextData;
  _data.displayAsPassword = data?.displayAsPassword ?? false;
  _data.restrict = data?.restrict ?? '';
  return _data;
}
