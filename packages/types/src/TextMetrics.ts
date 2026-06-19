// Measured size of a text field's rendered content — the glyph extent — independent of the field
// box. Distinct from the node's local bounds rectangle: bounds is the field box (the user-set
// width/height unless autoSize grows it), while TextMetrics is always the measured content size.
// Mirrors Flash's textWidth/textHeight. Filled from a computed TextLayoutResult.
export interface TextMetrics {
  width: number;
  height: number;
  numLines: number;
}
