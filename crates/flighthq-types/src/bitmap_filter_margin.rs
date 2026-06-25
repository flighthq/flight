//! Per-side pixel margins a bitmap filter adds around the source bounds.

/// The per-side pixel margins a filter adds around the source bounds. Each side
/// is the number of pixels the filter may paint _beyond_ the source rectangle on
/// that edge. Inner effects (inner shadow, inner glow) never expand the bounds;
/// all their fields are zero.
#[derive(Copy, Clone, Debug, Default, PartialEq, Eq)]
pub struct BitmapFilterMargin {
    /// Pixels added above the source rectangle.
    pub top: u32,
    /// Pixels added to the right of the source rectangle.
    pub right: u32,
    /// Pixels added below the source rectangle.
    pub bottom: u32,
    /// Pixels added to the left of the source rectangle.
    pub left: u32,
}
