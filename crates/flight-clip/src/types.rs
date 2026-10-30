//! flight-compiler: target-native
//! flight-compiler: string-union ClipRegionStatus=exact
//! flight-compiler: string-union-value ClipRegionStatus Active "active"
//! flight-compiler: string-union-value ClipRegionStatus Released "released"
//! flight-compiler: string-union ClipRegionContoursReason=exact
//! flight-compiler: string-union-value ClipRegionContoursReason OddCoordinateCount "odd-coordinate-count"
//! flight-compiler: string-union-value ClipRegionContoursReason TooFewPoints "too-few-points"
//!
//! Public TypeScript Clip types retain their established owner in `@flighthq/types`.

use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, Ref};
use flight_geometry::{Rectangle, create_rectangle};
pub use flight_path::PathWinding;

pub(crate) type LogState = flight_log::LogStateRef;

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

flight_entity::impl_entity!(ClipRegion);
