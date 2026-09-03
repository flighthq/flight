import type { Entity } from './Entity';
import type { Node2D, Node2DData, Node2DRuntime } from './Node2D';
import type { TextAutoSize } from './TextAutoSize';
import type { TextFormat } from './TextFormat';
import type { TextLayoutParams, TextLayoutResult, TextMeasureFunction } from './TextLayout';
import type { TextVerticalAlign } from './TextVerticalAlign';

export interface TextLabelData extends Node2DData, Entity {
  autoSize: TextAutoSize;
  height: number;
  text: string;
  textFormat: TextFormat;
  // Vertical placement of the text block within `height`; block-level, distinct from TextFormat.align.
  // Inert while autoSize fits the height to the content (no vertical slack).
  verticalAlign: TextVerticalAlign;
  width: number;
}

export interface TextLabelRuntime extends Node2DRuntime {
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
  // The text string the cached layout was computed from. null until first laid out. Retained so
  // diagnostic guards can detect bare data.text mutation that bypassed the setter (the revision
  // stays stale while the live string differs from the one the layout used).
  textLayoutUsingText: string | null;
}

export interface TextLabel extends Node2D {
  data: TextLabelData;
}

export const TextLabelKind = 'TextLabel';
