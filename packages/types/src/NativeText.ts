import type { DisplayObject, DisplayObjectData, DisplayObjectRuntime } from './DisplayObject';
import type { TextAutoSize } from './TextAutoSize';
import type { TextFormatAlign } from './TextFormat';

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
  color?: number;
  font?: string;
  italic?: boolean;
  leading?: number;
  size?: number;
}

export interface NativeTextData extends DisplayObjectData {
  autoSize: TextAutoSize;
  height: number;
  style: NativeTextStyle;
  text: string;
  width: number;
}

export interface NativeTextRuntime extends DisplayObjectRuntime {
  // The backing platform element, created and owned by the platform renderer (displayobject-dom). null until
  // the node is first drawn, and on backends that do not composite a real element. displayobject only
  // holds the slot and never touches the DOM, mirroring HtmlViewData.element.
  element: HTMLElement | null;
  // Measured content size the platform renderer writes back after laying the element out, so autoSize
  // bounds stay DOM-free: computeNativeTextLocalBoundsRectangle reads these numbers instead of calling
  // getBoundingClientRect itself (which would pull a DOM dependency into displayobject). 0 until measured.
  measuredHeight: number;
  measuredWidth: number;
}

export interface NativeText extends DisplayObject {
  data: NativeTextData;
}

export const NativeTextKind: unique symbol = Symbol('NativeText');
