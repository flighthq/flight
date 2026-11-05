// Compatibility wrapper: Scene2D Formats owns the SVG registry contracts.
export type {
  SvgClipContext,
  SvgClipHandler,
  SvgClipHandlerEntry,
  SvgColor,
  SvgCssRule,
  SvgElementContext,
  SvgElementHandler,
  SvgElementHandlerEntry,
  SvgGradient,
  SvgGradientStop,
  SvgImportContext,
  SvgRegistry,
  SvgStyle,
} from '@flighthq/scene2d-formats/contract';

/** @deprecated Import SVG contracts from `@flighthq/scene2d-formats/contract`. These runtime
 * values stay duplicated because @flighthq/types may re-export owner contracts only as types. */
export const SvgElementKind = {
  Container: 'container',
  Geometry: 'geometry',
  Image: 'image',
  Text: 'text',
  Use: 'use',
} as const;

export type SvgElementKind = string;

export const SvgClipKind = {
  Path: 'clip-path',
} as const;

export type SvgClipKind = string;
