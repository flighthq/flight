use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, Ref};
use flight_geometry::{Rectangle, create_rectangle};
use flight_path::PathWinding;

// flight-lint: allow(f64) clip contours preserve the source Path.data coordinates and flattened path precision
#[derive(Debug)]
pub struct ClipRegion {
    runtime: EntityRuntimeSlot,
    pub rect: Rectangle,
    pub contours: Option<Vec<Vec<f64>>>,
    pub winding: PathWinding,
    pub version: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ClipRegionStatus {
    Active,
    Released,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClipRegionExplanation {
    pub conservative: bool,
    pub status: ClipRegionStatus,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ClipRegionContoursReason {
    OddCoordinateCount,
    TooFewPoints,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClipRegionContoursExplanation {
    pub contour_index: usize,
    pub coordinate_count: usize,
    pub reason: ClipRegionContoursReason,
}

// flight-lint: allow(f64) contour guards receive the exact f64 source coordinate arrays
pub type ClipRegionContoursGuard =
    Arc<dyn Fn(&ClipRegionContoursExplanation, &[Vec<f64>]) + Send + Sync>;

pub type ClipRegionReleaseGuard = Arc<dyn Fn(&Ref<ClipRegion>) + Send + Sync>;

pub type ClipRegionUseGuard = Arc<dyn Fn(&Ref<ClipRegion>) + Send + Sync>;

/// Caller-owned replacement for the source package's pool and three module-global guard slots.
pub struct ClipRegionState {
    pub(crate) pool: Vec<Ref<ClipRegion>>,
    pub(crate) contours_guard: Option<ClipRegionContoursGuard>,
    pub(crate) release_guard: Option<ClipRegionReleaseGuard>,
    pub(crate) use_guard: Option<ClipRegionUseGuard>,
}

impl Default for ClipRegion {
    fn default() -> Self {
        return ClipRegion {
            runtime: EntityRuntimeSlot::default(),
            rect: create_rectangle(0.0, 0.0, 0.0, 0.0),
            contours: None,
            winding: PathWinding::NonZero,
            version: 0,
        };
    }
}

impl Default for ClipRegionState {
    fn default() -> Self {
        return ClipRegionState {
            pool: Vec::new(),
            contours_guard: None,
            release_guard: None,
            use_guard: None,
        };
    }
}

flight_entity::impl_entity!(ClipRegion);
