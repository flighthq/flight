//! 2D transform update step for the render walk.
//!
//! Propagates the local 2D transform matrix from the source node into the
//! `RenderProxy2D`, composing it with the parent's resolved world transform.

use flighthq_geometry::{copy_matrix, multiply_matrix};
use flighthq_types::{Matrix, MatrixLike, RenderProxy2D, RenderState};

use crate::render_state::{RenderStateId, RenderStateStore, get_render_state_runtime};

// ---------------------------------------------------------------------------
// Free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Alias for `update_render_proxy_2d_transform`; retained so callers that
/// specifically deal with display objects can use the more descriptive name.
pub fn update_display_object_render_transform(
    store: &RenderStateStore,
    id: RenderStateId,
    state: &RenderState,
    data: &mut RenderProxy2D,
    parent_data: Option<&RenderProxy2D>,
    local_transform: &Matrix,
    local_transform_id: u32,
) -> bool {
    update_render_proxy_2d_transform(
        store,
        id,
        state,
        data,
        parent_data,
        local_transform,
        local_transform_id,
    )
}

/// Updates the `transform_2d` field of `data` by composing the source node's
/// local transform matrix with the parent's resolved world matrix.
///
/// Returns `true` if the transform was recalculated (either the parent changed
/// this frame or the local revision id is stale), `false` otherwise.
///
/// Read all input values into locals before writing `data.transform_2d` to
/// keep the function safe when `data` is also the parent.
pub fn update_render_proxy_2d_transform(
    store: &RenderStateStore,
    id: RenderStateId,
    state: &RenderState,
    data: &mut RenderProxy2D,
    parent_data: Option<&RenderProxy2D>,
    local_transform: &Matrix,
    local_transform_id: u32,
) -> bool {
    let local_transform_id = local_transform_id as u64;
    let current_frame_id = get_render_state_runtime(store, id).current_frame_id;
    let parent_dirty = parent_data
        .map(|p| p.base.transform_frame_id == current_frame_id)
        .unwrap_or(false);
    let local_dirty = data.base.last_local_transform_id != local_transform_id;

    if parent_dirty || local_dirty {
        // Read inputs into locals before writing data.transform_2d so the function is safe
        // when `data` is also the parent (aliasing). The parent transform is taken from the
        // parent proxy when present, else from the state's root render transform.
        let local = matrix_to_like(local_transform);
        let parent_transform = match parent_data {
            Some(p) => Some(matrix_to_like(&p.transform_2d)),
            None => state.render_transform_2d.map(|m| matrix_to_like(&m)),
        };
        let mut result = MatrixLike::default();
        match parent_transform {
            Some(parent) => multiply_matrix(&mut result, &parent, &local),
            None => copy_matrix(&mut result, &local),
        }
        copy_matrix_like_to_matrix(&mut data.transform_2d, &result);
        data.base.transform_frame_id = current_frame_id;
        data.base.last_local_transform_id = local_transform_id;
        return true;
    }
    false
}

#[inline]
fn copy_matrix_like_to_matrix(out: &mut Matrix, source: &MatrixLike) {
    out.a = source.a;
    out.b = source.b;
    out.c = source.c;
    out.d = source.d;
    out.tx = source.tx;
    out.ty = source.ty;
}

#[inline]
fn matrix_to_like(m: &Matrix) -> MatrixLike {
    MatrixLike {
        a: m.a,
        b: m.b,
        c: m.c,
        d: m.d,
        tx: m.tx,
        ty: m.ty,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::render_state::{RenderStateStore, create_render_state};

    // update_display_object_render_transform (delegates to update_render_proxy2_d_transform)

    #[test]
    fn update_display_object_render_transform_delegates_to_proxy_transform() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let state = RenderState::default();
        let local = Matrix {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            tx: 7.0,
            ty: 9.0,
        };
        let mut data = RenderProxy2D::default();
        let dirty =
            update_display_object_render_transform(&store, id, &state, &mut data, None, &local, 1);
        assert!(dirty);
        assert!((data.transform_2d.tx - 7.0).abs() < 1e-5);
        assert!((data.transform_2d.ty - 9.0).abs() < 1e-5);
    }

    // update_render_proxy2_d_transform

    #[test]
    fn update_render_proxy2_d_transform_copies_local_when_no_parent() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let state = RenderState::default();
        let local = Matrix {
            a: 2.0,
            b: 0.0,
            c: 0.0,
            d: 3.0,
            tx: 10.0,
            ty: 20.0,
        };
        let mut data = RenderProxy2D::default();
        let dirty =
            update_render_proxy_2d_transform(&store, id, &state, &mut data, None, &local, 1);
        assert!(dirty);
        assert!((data.transform_2d.a - 2.0).abs() < 1e-5);
        assert!((data.transform_2d.tx - 10.0).abs() < 1e-5);
        assert!((data.transform_2d.ty - 20.0).abs() < 1e-5);
    }

    #[test]
    fn update_render_proxy2_d_transform_composes_with_parent() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let state = RenderState::default();
        // Parent at tx=100.
        let parent = RenderProxy2D {
            transform_2d: Matrix {
                a: 1.0,
                b: 0.0,
                c: 0.0,
                d: 1.0,
                tx: 100.0,
                ty: 0.0,
            },
            ..Default::default()
        };
        // Local at tx=50.
        let local = Matrix {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            tx: 50.0,
            ty: 0.0,
        };
        let mut data = RenderProxy2D::default();
        update_render_proxy_2d_transform(&store, id, &state, &mut data, Some(&parent), &local, 1);
        // Composed tx should be 150.
        assert!(
            (data.transform_2d.tx - 150.0).abs() < 1e-5,
            "tx={}",
            data.transform_2d.tx
        );
    }

    #[test]
    fn update_render_proxy2_d_transform_not_dirty_when_clean() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let state = RenderState::default();
        let local = Matrix {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            tx: 0.0,
            ty: 0.0,
        };
        let mut data = RenderProxy2D::default();
        // First call — dirty.
        update_render_proxy_2d_transform(&store, id, &state, &mut data, None, &local, 1);
        // Second call with same revision id and no parent frame change — not dirty.
        let dirty =
            update_render_proxy_2d_transform(&store, id, &state, &mut data, None, &local, 1);
        assert!(!dirty);
    }
}
