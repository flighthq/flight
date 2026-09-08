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
