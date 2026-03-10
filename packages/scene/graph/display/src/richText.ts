import type { PartialWithData, RichText, RichTextData } from '@flighthq/types';
import { RichTextKind } from '@flighthq/types';

import { createDisplayObjectGeneric } from './displayObject';
import type { RichTextDataInternal } from './internal';
import { createTextData } from './text';

export function createRichText(obj?: Readonly<PartialWithData<RichText>>): RichText {
  return createDisplayObjectGeneric(RichTextKind, obj, createRichTextData) as RichText;
}

export function createRichTextData(data?: Readonly<Partial<RichTextData>>): RichTextData {
  const _data = createTextData(data) as RichTextData;
  _data.background = data?.background ?? false;
  _data.backgroundColor = data?.backgroundColor ?? 0xffffff;
  _data.border = data?.border ?? false;
  _data.borderColor = data?.borderColor ?? 0;
  _data.condenseWhite = data?.condenseWhite ?? false;
  _data.defaultTextFormat = data?.defaultTextFormat ?? {};
  _data.htmlText = data?.htmlText ?? '';
  _data.maxChars = data?.maxChars ?? -1;
  _data.mouseWheelEnabled = data?.mouseWheelEnabled ?? true;
  _data.multiline = data?.multiline ?? true;
  (_data as RichTextDataInternal).scrollH = data?.scrollH ?? 0;
  (_data as RichTextDataInternal).scrollV = data?.scrollV ?? 1;
  _data.selectable = data?.selectable ?? true;
  // _data.styleSheet = data?.styleSheet = undefined;
  _data.textColor = data?.textColor ?? 0;
  _data.wordWrap = data?.wordWrap ?? false;
  return _data;
}
