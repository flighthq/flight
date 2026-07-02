/**
 * The per-side pixel margins a filter adds around the source bounds. Each side is the number of
 * pixels the filter may paint _beyond_ the source rectangle on that edge. Inner effects (inner
 * shadow, inner glow) never expand the bounds; all their fields are zero.
 */
export interface BitmapFilterMargin {
  /** Pixels added above the source rectangle. */
  top: number;
  /** Pixels added to the right of the source rectangle. */
  right: number;
  /** Pixels added below the source rectangle. */
  bottom: number;
  /** Pixels added to the left of the source rectangle. */
  left: number;
}
