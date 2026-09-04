import type { Node2D, Node2DData, Node2DRuntime } from './Node2D';
import type { TextAutoSize } from './TextAutoSize';
import type { TextFormatAlign } from './TextFormat';
import type { TextVerticalAlign } from './TextVerticalAlign';

// NativeText is the platform/DOM-backed text type. It opts OUT of the TextLayout spine entirely (no
// textLayout slot, no buildTextLayoutParams), so it is a sibling of TextLabel/RichText, NOT an extension
// of them. The platform engine (a DOM element on web; CoreText/DirectWrite on a native port) owns
// layout, measurement, and rendering.

// A platform text style descriptor handed to the native engine, rather than the format-range model the
// TextLayout spine uses for TextLabel/RichText. Kept intentionally small and canonical: the common
// font/size/color/align knobs a platform text element understands directly.
export interface NativeTextStyle {
  align?: TextFormatAlign;
  bold?: boolean;
  // Run color as Flight's packed sRGB RGBA integer (`0xRRGGBBAA`), matching TextFormat.color; alpha is
  // linear coverage. Scene state carries the SDK convention even though the platform engine consuming it
  // wants a CSS color — the renderer converts at that boundary.
  color?: number;
  font?: string;
  italic?: boolean;
  leading?: number;
  size?: number;
}

export interface NativeTextData extends Node2DData {
  autoSize: TextAutoSize;
  height: number;
  style: NativeTextStyle;
  text: string;
  // The vertical placement of the text block within the fixed-height field box, matching
  // TextLabelData.verticalAlign. A block-level property of the whole field (like width/height/autoSize),
  // not part of the per-run NativeTextStyle — the platform engine lays out the run, the field frames it.
  // Inert under autoSize (the box hugs the content, so there is no slack to align within).
  verticalAlign: TextVerticalAlign;
  width: number;
}

export interface NativeTextRuntime extends Node2DRuntime {
  // The backing platform element, created and owned by the platform renderer (scene2d-dom). null until
  // the node is first drawn, and on backends that do not composite a real element. scene2d only
  // holds the slot and never touches the DOM, mirroring HtmlViewData.element.
  element: HTMLElement | null;
  // Measured content size the platform renderer writes back after laying the element out, so autoSize
  // bounds stay DOM-free: computeNativeTextLocalBoundsRectangle reads these numbers instead of calling
  // getBoundingClientRect itself (which would pull a DOM dependency into scene2d). 0 until measured.
  measuredHeight: number;
  measuredWidth: number;
}

export interface NativeText extends Node2D {
  data: NativeTextData;
}

export const NativeTextKind = 'NativeText';
