import type { BitmapFont, BitmapFontEncoding, BitmapFontParseOptions } from '@flighthq/bitmapfont/contract';
import type { ImportDiagnostic } from '@flighthq/importdiagnostics/contract';

/** Identifies a bitmap font descriptor format for detection and dispatch. */
export type BitmapFontFormatKind = string;

export const BitmapFontFormatKindBmFontBinary = 'BmFontBinary';
export const BitmapFontFormatKindBmFontText = 'BmFontText';
export const BitmapFontFormatKindBmFontXml = 'BmFontXml';
export const BitmapFontFormatKindBmFontJson = 'BmFontJson';

export interface BitmapFontFormatEntry {
  detect: (bytes: Readonly<Uint8Array>) => boolean;
  parse: (
    bytes: Readonly<Uint8Array>,
    options?: Readonly<BitmapFontParseOptions>,
    diagnostics?: ImportDiagnostic[],
  ) => BitmapFont | null;
}

export interface BitmapFontFormatDescriptor {
  readonly entry: BitmapFontFormatEntry;
  readonly kind: BitmapFontFormatKind;
}

export interface BitmapFontImportOptions {
  readonly formats?: readonly Readonly<BitmapFontFormatDescriptor>[];
}

export type BitmapFontParseExplanationFormat = 'fnt' | 'json' | 'unknown' | 'xml';

export type BitmapFontParseExplanationReason =
  | 'invalid-data'
  | 'missing-chars'
  | 'missing-common'
  | 'ok'
  | 'unresolved-page';

export interface BitmapFontParseExplanation {
  charCount: number;
  detectedFormat: BitmapFontParseExplanationFormat;
  kerningCount: number;
  pageCount: number;
  reason: BitmapFontParseExplanationReason;
  success: boolean;
  unresolvedPages: readonly number[];
}

export interface BitmapFontCharRecord {
  height: number;
  id: number;
  page: number;
  width: number;
  x: number;
  xadvance: number;
  xoffset: number;
  y: number;
  yoffset: number;
}

export interface BitmapFontKerningRecord {
  amount: number;
  first: number;
  second: number;
}

export interface BitmapFontPageRecord {
  file: string;
  id: number;
}

export interface BitmapFontRecord {
  base: number;
  chars: BitmapFontCharRecord[];
  encoding: BitmapFontEncoding;
  kernings: BitmapFontKerningRecord[];
  lineHeight: number;
  pages: BitmapFontPageRecord[];
}
