/// Identifier for a spatial object.
pub type SpatialObjectId = u64;

/// The mode a spatial index currently holds an object in.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SpatialIndexingMode {
    Absent,
    Cells,
    Declined,
    Overflow,
}

/// The operation that triggered a spatial indexing notice.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SpatialIndexingOperation {
    Insert,
    Update,
    Remove,
}

/// Why bounds were declined by the spatial index.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SpatialDeclineReason {
    InvertedBounds,
    NonFiniteBounds,
}

/// Why a spatial indexing notice was raised. Superset of SpatialDeclineReason.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SpatialIndexingReason {
    InvalidCellSize,
    InvertedBounds,
    MissingId,
    NonFiniteBounds,
}

/// Reports how the index is currently holding a specific object. Pure diagnostic data.
#[derive(Debug, Clone, PartialEq)]
pub struct SpatialIndexingExplanation {
    pub bucket_count: f64,
    pub id: SpatialObjectId,
    pub mode: SpatialIndexingMode,
    pub reason: Option<SpatialDeclineReason>,
}

/// A notice raised by the spatial indexing system for diagnostic purposes.
#[derive(Debug, Clone, PartialEq)]
pub struct SpatialIndexingNotice {
    pub cell_size: f32,
    pub id: SpatialObjectId,
    pub mode: SpatialIndexingMode,
    pub operation: SpatialIndexingOperation,
    pub reason: Option<SpatialIndexingReason>,
    pub would_occupy_bucket_count: f64,
}

/// Function type for the spatial indexing guard callback.
pub type SpatialIndexingGuard = fn(&SpatialIndexingNotice);

/// Hands a notice to the given guard, or does nothing when the guard is None.
/// This is the shared reporting seam used by both dimensions' backends.
pub fn report_spatial_indexing(
    guard: Option<SpatialIndexingGuard>,
    notice: &SpatialIndexingNotice,
) {
    if let Some(g) = guard {
        g(notice);
    }
}
