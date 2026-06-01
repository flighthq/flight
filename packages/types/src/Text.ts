import type { DisplayObject, DisplayObjectData, DisplayObjectRuntime } from './DisplayObject';
import type { TextAutoSize } from './TextAutoSize';
import type { TextFormat } from './TextFormat';
import type { TextLayoutResult } from './TextLayout';

export interface TextData extends DisplayObjectData {
  autoSize: TextAutoSize;
  text: string;
  textFormat: TextFormat;
}

export interface TextRuntime extends DisplayObjectRuntime {
  textLayout: TextLayoutResult | null;
}

export interface Text extends DisplayObject {
  data: TextData;
}

export const TextKind: unique symbol = Symbol('Text');
