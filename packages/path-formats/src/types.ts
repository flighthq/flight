/**
 * Formatting options for `formatSvgPathData` (TS `SvgPathDataFormatOptions`). Plain record.
 */
export interface SvgPathDataFormatOptions {
  /**
   * Decimal places to retain; `undefined` (omitted) preserves full numeric precision.
   */
  precision?: number;
}

/**
 * Why SVG path data cannot be parsed (the non-null TS `explainSvgPathData` result). `position` is
 * the UTF-16 code-unit index into the input, as in the source; `reason` is the stable source
 * spelling (e.g. `"expected-moveto"`). Plain record.
 */
export interface SvgPathDataExplanation {
  position: number;
  reason: string;
}
