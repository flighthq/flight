import type { PartialWithData, RichText, RichTextData } from '@flighthq/types';

import { createText } from './createText';

export function createRichText(obj: PartialWithData<RichText> = {}): RichText {
  if (obj.data === undefined) obj.data = {} as RichTextData;
  if (obj.data.background === undefined) obj.data.background = false;
  if (obj.data.backgroundColor === undefined) obj.data.backgroundColor = 0xffffff;
  if (obj.data.border === undefined) obj.data.border = false;
  if (obj.data.borderColor === undefined) obj.data.borderColor = 0;
  if (obj.data.condenseWhite === undefined) obj.data.condenseWhite = false;
  if (obj.data.defaultTextFormat === undefined) obj.data.defaultTextFormat = {};
  if (obj.data.htmlText === undefined) obj.data.htmlText = '';
  if (obj.data.maxChars === undefined) obj.data.maxChars = -1;
  if (obj.data.mouseWheelEnabled === undefined) obj.data.mouseWheelEnabled = true;
  if (obj.data.multiline === undefined) obj.data.multiline = true;
  if (obj.data.scrollH === undefined) (obj.data as RichTextDataInternal).scrollH = 0;
  if (obj.data.scrollV === undefined) (obj.data as RichTextDataInternal).scrollV = 1;
  if (obj.data.selectable === undefined) obj.data.selectable = true;
  // if (obj.data.styleSheet === undefined) obj.data.styleSheet = undefined;
  if (obj.data.textColor === undefined) obj.data.textColor = 0;
  if (obj.data.wordWrap === undefined) obj.data.wordWrap = false;
  if (obj.type === undefined) obj.type = 'richtext';
  return createText(obj) as RichText;
}

type RichTextDataInternal = Omit<RichTextData, 'scrollH' | 'scrollV'> & {
  scrollH: number;
  scrollV: number;
};
