import type { InputText, InputTextData, PartialWithData } from '@flighthq/types';

import { createPrimitive } from './createPrimitive';
import { createRichTextData } from './createRichText';

export function createInputText(obj?: PartialWithData<InputText>): InputText {
  return createPrimitive<InputText, InputTextData>('inputtext', obj, createInputTextData);
}

export function createInputTextData(data?: Partial<InputTextData>): InputTextData {
  const _data = createRichTextData(data) as InputTextData;
  _data.displayAsPassword = data?.displayAsPassword ?? false;
  _data.restrict = data?.restrict ?? '';
  return _data;
}
