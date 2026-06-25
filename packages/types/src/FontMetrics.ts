// Vertical font metrics from the text-shaping layer. All values are in the font's design units
// unless the backend normalizes them to pixels (see unitsPerEm). Callers divide by unitsPerEm to
// scale to any target size.
export interface FontMetrics {
  ascent: number;
  capHeight: number;
  descent: number;
  lineGap: number;
  underlinePosition: number;
  underlineThickness: number;
  unitsPerEm: number;
  xHeight: number;
}
