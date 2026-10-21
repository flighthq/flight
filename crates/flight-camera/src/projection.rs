//! Projection descriptors: allocation, projection-matrix composition and union narrowing (TS
//! `projection.ts`).

use std::sync::RwLock;

use flight_entity::{Ref, allocate_entity};
use flight_geometry::{Matrix4, create_matrix4, set_orthographic_matrix4, set_perspective_matrix4};

use crate::types::*;

/// Allocates an orthographic projection from explicit view-volume half-extents (TS
/// `createOrthographicProjection`).
pub fn create_orthographic_projection(
    opts: &OrthographicProjectionOptions,
) -> Ref<OrthographicProjection> {
    let mut out: OrthographicProjection = allocate_entity();
    initialize_orthographic_projection(&mut out, opts);
    return Ref::new(RwLock::new(out));
}

/// Allocates a perspective projection from a vertical field of view (radians) and viewport aspect
/// (TS `createPerspectiveProjection`). `aspect` defaults to 1.
pub fn create_perspective_projection(
    opts: &PerspectiveProjectionOptions,
) -> Ref<PerspectiveProjection> {
    let mut out: PerspectiveProjection = allocate_entity();
    initialize_perspective_projection(&mut out, opts);
    return Ref::new(RwLock::new(out));
}

/// Allocates a raw projection that uses a pre-built matrix verbatim (TS `createRawProjection`). The
/// matrix is copied, not referenced.
pub fn create_raw_projection(opts: &RawProjectionOptions) -> Ref<RawProjection> {
    let mut out: RawProjection = allocate_entity();
    initialize_raw_projection(&mut out, opts);
    return Ref::new(RwLock::new(out));
}

/// Builds an orthographic projection under construction (TS `initializeOrthographicProjection`).
// flight-lint: allow(conform-extra) D12: OrthographicProjection extends Entity; the pinned TS index.ts exports no initializeOrthographicProjection
pub fn initialize_orthographic_projection(
    out: &mut OrthographicProjection,
    opts: &OrthographicProjectionOptions,
) {
    out.half_height = opts.half_height;
    out.half_width = opts.half_width;
}

/// Builds a perspective projection under construction (TS `initializePerspectiveProjection`).
// flight-lint: allow(conform-extra) D12: PerspectiveProjection extends Entity; the pinned TS index.ts exports no initializePerspectiveProjection
pub fn initialize_perspective_projection(
    out: &mut PerspectiveProjection,
    opts: &PerspectiveProjectionOptions,
) {
    out.aspect = opts.aspect.unwrap_or(1.0);
    out.fov_y = opts.fov_y;
}

/// Builds a raw projection under construction, copying the supplied matrix into a fresh entity (TS
/// `initializeRawProjection`).
// flight-lint: allow(conform-extra) D12: RawProjection extends Entity; the pinned TS index.ts exports no initializeRawProjection
pub fn initialize_raw_projection(out: &mut RawProjection, opts: &RawProjectionOptions) {
    let mut matrix = create_matrix4();
    matrix.m = opts.matrix.m;
    out.matrix = Ref::new(RwLock::new(matrix));
}

/// Returns the larger world-space footprint of one texel across an orthographic projection (TS
/// `getOrthographicProjectionTexelSize`). `pixel_width`/`pixel_height` must be positive.
pub fn get_orthographic_projection_texel_size(
    projection: &OrthographicProjection,
    pixel_width: f32,
    pixel_height: f32,
) -> f32 {
    let width = (projection.half_width * 2.0) / pixel_width;
    let height = (projection.half_height * 2.0) / pixel_height;
    return if width > height { width } else { height };
}

/// True when the projection is an orthographic descriptor (TS `isOrthographicProjection`).
pub fn is_orthographic_projection(projection: &Projection) -> bool {
    return matches!(projection, Projection::Orthographic(_));
}

/// True when the projection is a perspective descriptor (TS `isPerspectiveProjection`).
pub fn is_perspective_projection(projection: &Projection) -> bool {
    return matches!(projection, Projection::Perspective(_));
}

/// True when the projection is a raw pre-built matrix (TS `isRawProjection`).
pub fn is_raw_projection(projection: &Projection) -> bool {
    return matches!(projection, Projection::Raw(_));
}

/// Writes the projection matrix for `projection` into `out` (TS `setProjectionMatrix4`). `aspect`
/// overrides a perspective projection's stored aspect and is ignored for orthographic projections;
/// raw projections copy their matrix verbatim. `near`/`far` come from the owning camera.
pub fn set_projection_matrix4(
    out: &mut Matrix4,
    projection: &Projection,
    aspect: f32,
    near: f32,
    far: f32,
) {
    match projection {
        Projection::Perspective(perspective) => {
            let fov_y = perspective.read().unwrap().fov_y;
            set_perspective_matrix4(out, (fov_y * 0.5).tan(), aspect, near, far);
        }
        Projection::Raw(raw) => {
            let matrix = raw.read().unwrap();
            let source = matrix.matrix.read().unwrap();
            out.m = source.m;
        }
        Projection::Orthographic(orthographic) => {
            let (half_width, half_height) = {
                let current = orthographic.read().unwrap();
                (current.half_width, current.half_height)
            };
            set_orthographic_matrix4(
                out,
                -half_width,
                half_width,
                -half_height,
                half_height,
                near,
                far,
            );
        }
    }
}
