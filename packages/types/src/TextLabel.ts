import type { DisplayObject, DisplayObjectData, DisplayObjectRuntime } from './DisplayObject';
import type { TextAutoSize } from './TextAutoSize';
import type { TextFormat } from './TextFormat';
import type { TextLayoutParams, TextLayoutResult, TextMeasureFunction } from './TextLayout';
import type { TextVerticalAlign } from './TextVerticalAlign';

export interface TextLabelData extends DisplayObjectData {
  autoSize: TextAutoSize;
  height: number;
  text: string;
  textFormat: TextFormat;
  // Vertical placement of the text block within `height`; block-level, distinct from TextFormat.align.
  // Inert while autoSize fits the height to the content (no vertical slack).
  verticalAlign: TextVerticalAlign;
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
  // *UsingId stamps (e.g. localBoundsUsingLocalBoundsId). ensureTextLayout recomputes the layout
  // when this differs from getNodeLocalContentRevision. -1 until first computed.
  textLayoutUsingContentId: number;
}

export interface TextLabel extends DisplayObject {
  data: TextLabelData;
}

export const TextLabelKind = 'TextLabel';
