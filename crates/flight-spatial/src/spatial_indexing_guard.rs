use std::sync::{Arc, Mutex, PoisonError};

/// Identifier for a spatial object.
pub type SpatialObjectId = i32;

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
// flight-lint: allow(f64) bucket counts preserve double span precision beyond f32 integer exactness
#[derive(Debug, Clone, PartialEq)]
pub struct SpatialIndexingExplanation {
    pub bucket_count: f64,
    pub id: SpatialObjectId,
    pub mode: SpatialIndexingMode,
    pub reason: Option<SpatialDeclineReason>,
}

/// A notice raised by the spatial indexing system for diagnostic purposes.
// flight-lint: allow(f64) refused bucket spans can exceed f32 integer precision and must remain diagnostic doubles
#[derive(Debug, Clone, PartialEq)]
pub struct SpatialIndexingNotice {
    pub cell_size: f32,
    pub id: SpatialObjectId,
    pub mode: SpatialIndexingMode,
    pub operation: SpatialIndexingOperation,
    pub reason: Option<SpatialIndexingReason>,
    pub would_occupy_bucket_count: f64,
}

/// Shared diagnostics callback for noteworthy operations in either dimension.
pub type SpatialIndexingGuard = Arc<dyn Fn(&SpatialIndexingNotice) + Send + Sync>;

/// Hands a notice to the installed guard, or does nothing when none is installed.
pub fn report_spatial_indexing(notice: &SpatialIndexingNotice) {
    let guard = SPATIAL_INDEXING_GUARD.lock().unwrap_or_else(PoisonError::into_inner).clone();
    if let Some(guard) = guard { guard(notice); }
}

/// Installs the diagnostic guard shared by all spatial backends. None uninstalls it.
pub fn set_spatial_indexing_guard(guard: Option<SpatialIndexingGuard>) {
    *SPATIAL_INDEXING_GUARD.lock().unwrap_or_else(PoisonError::into_inner) = guard;
}

// flight-lint: allow(hidden-state) D5 opt-in diagnostics-only slot shared by both dimensions, mirrors TS, defaults to None and cannot change indexing results
static SPATIAL_INDEXING_GUARD: Mutex<Option<SpatialIndexingGuard>> = Mutex::new(None);
