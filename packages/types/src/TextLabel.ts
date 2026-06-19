import type { DisplayObject, DisplayObjectData, DisplayObjectRuntime } from './DisplayObject';
import type { TextAutoSize } from './TextAutoSize';
import type { TextFormat } from './TextFormat';
import type { TextLayoutParams, TextLayoutResult, TextMeasureFunction } from './TextLayout';

export interface TextLabelData extends DisplayObjectData {
  autoSize: TextAutoSize;
  height: number;
  text: string;
  textFormat: TextFormat;
  width: number;
}

export interface TextLabelRuntime extends DisplayObjectRuntime {
  // Per-kind content + constraint assembly for the shared ensureTextLayout: TextLabel produces a
  // single format run; RichText produces multi-format/html runs with wrap/multiline. The measure
  // provider is injected by ensureTextLayout. This is the one place the text kinds differ in how they
  // feed the layout engine; everything downstream (caching, metrics, bounds, render) is shared.
  buildTextLayoutParams: (source: Readonly<TextLabel>, measure: TextMeasureFunction) => TextLayoutParams;
  textLayout: TextLayoutResult | null;
  // The local-content revision the cached textLayout was computed at, mirroring the node graph's
  // *UsingID stamps (e.g. localBoundsUsingLocalBoundsID). ensureTextLayout recomputes the layout
  // when this differs from getNodeLocalContentRevision. -1 until first computed.
  textLayoutUsingContentID: number;
}

export interface TextLabel extends DisplayObject {
  data: TextLabelData;
}

export const TextLabelKind: unique symbol = Symbol('TextLabel');
