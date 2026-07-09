/**
 * The mirrored pixel offset pair a bevel effect samples along its light angle. `dx`/`dy` position
 * the highlight (light-facing) side; `negDx`/`negDy` position the shadow side directly opposite it.
 * The shadow fields are the exact negation of the highlight fields (`negDx === -dx`,
 * `negDy === -dy`), so the two beveled edges stay symmetric about the source.
 */
export interface BevelFilterOffsets {
  /** Highlight-side x offset, in pixels. */
  dx: number;
  /** Highlight-side y offset, in pixels. */
  dy: number;
  /** Shadow-side x offset, in pixels; the negation of `dx`. */
  negDx: number;
  /** Shadow-side y offset, in pixels; the negation of `dy`. */
  negDy: number;
}
