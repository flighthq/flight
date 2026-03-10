import type { InputText, InputTextData, PartialWithData } from '@flighthq/types';
import { InputTextKind } from '@flighthq/types';

import { createDisplayObjectGeneric } from './displayObject';
import { createRichTextData } from './richText';

export function createInputText(obj?: Readonly<PartialWithData<InputText>>): InputText {
  return createDisplayObjectGeneric(InputTextKind, obj, createInputTextData) as InputText;
}

export function createInputTextData(data?: Readonly<Partial<InputTextData>>): InputTextData {
  const _data = createRichTextData(data) as InputTextData;
  _data.displayAsPassword = data?.displayAsPassword ?? false;
  _data.restrict = data?.restrict ?? '';
  return _data;
}
