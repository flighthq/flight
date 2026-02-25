import type { InputText, InputTextData, PartialWithData } from '@flighthq/types';

import { createRichText } from './createRichText';

export function createInputText(obj: PartialWithData<InputText> = {}): InputText {
  if (obj.data === undefined) obj.data = {} as InputTextData;
  if (obj.data.displayAsPassword === undefined) obj.data.displayAsPassword = false;
  if (obj.data.restrict === undefined) obj.data.restrict = '';
  if (obj.type === undefined) obj.type = 'inputtext';
  return createRichText(obj) as InputText;
}
