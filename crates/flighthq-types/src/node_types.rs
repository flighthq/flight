use crate::geometry::Rectangle;

/// Fill / winding rule for path geometry.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum PathWinding {
    #[default]
    NonZero,
    EvenOdd,
}

/// A hard geometric clip applied to a node and its subtree.
///
/// - `contours == None`: axis-aligned rectangle scissor.
/// - `contours == Some(_)`: arbitrary path contours, stencil-then-cover.
#[derive(Clone, Debug)]
pub struct ClipRegion {
    /// Bounding rectangle; for the rect form, this IS the clip.
    pub rect: Rectangle,
    /// Flattened contour list (flat x,y pairs), or `None` for the rect form.
    pub contours: Option<Vec<Vec<f32>>>,
    /// Fill rule for the contour form.
    pub winding: PathWinding,
    /// Bumped whenever geometry changes so backends re-upload derived state.
    pub version: u32,
}
