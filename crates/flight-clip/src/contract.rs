//! The full contract lane, mirroring the pinned TypeScript `contract.ts`.

pub use super::clip_region::{
    acquire_clip_region, clip_region_contains_clip_region, clip_region_contains_point,
    clip_region_contains_rectangle, clip_region_intersects_clip_region,
    clip_region_intersects_rectangle, clone_clip_region, copy_clip_region,
    create_clip_region_from_contours, create_clip_region_from_rectangle, equals_clip_region,
    explain_clip_region, explain_clip_region_contours, get_clip_region_bounds,
    initialize_clip_region_from_contours, initialize_clip_region_from_rectangle,
    intersect_clip_regions, invalidate_clip_region, is_clip_region_empty,
    is_clip_region_rectangular, normalize_clip_region, release_clip_region,
    set_clip_region_contours_guard, set_clip_region_release_guard, set_clip_region_to_contours,
    set_clip_region_to_rectangle, set_clip_region_use_guard, transform_clip_region,
    union_clip_regions,
};
pub use super::clip_region_shapes::{
    create_clip_region_from_circle, create_clip_region_from_ellipse, create_clip_region_from_path,
    create_clip_region_from_rounded_rectangle, initialize_clip_region_from_path,
};
pub use super::enable_clip_guards::*;
pub use super::rust_api::*;
pub use super::rust_types::*;
