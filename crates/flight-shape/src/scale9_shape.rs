//! Nine-slice shape kinds (TS `scale9Shape.ts`).
// flight-lint: allow-file(f64) D1: shape command tokens, path geometry and morph progress use the canonical f64 Path lane; matrices stay f32

use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_scene2d::contract::{Node2DRuntime, create_node2d};

use crate::shape::create_shape_runtime;
use crate::shape::create_shape_runtime_extra;
use crate::types::*;

/// Creates a nine-slice shape around a grid (TS `createScale9Shape`).
pub fn create_scale9_shape(
    grid: &ShapeScale9Grid,
    obj: Option<&PartialScale9Shape>,
) -> Ref<Scale9Shape> {
    let mut out: Scale9Shape = create_node2d(
        SCALE9_SHAPE_KIND.to_string(),
        obj.map(|obj| &obj.node),
        Some(create_scale9_shape_runtime),
    );
    out.data = create_scale9_shape_data(grid, obj.and_then(|obj| obj.data.as_ref()));
    let state = out.data.bounds_state.clone();
    crate::shape::set_shape_runtime_for_scale9_shape(&mut out, create_shape_runtime_extra(&state));
    return Arc::new(RwLock::new(out));
}

/// Allocates nine-slice shape data (TS `createScale9ShapeData`).
pub fn create_scale9_shape_data(
    grid: &ShapeScale9Grid,
    data: Option<&PartialScale9ShapeData>,
) -> Scale9ShapeData {
    let mut out: Scale9ShapeData = allocate_entity();
    initialize_scale9_shape_data(&mut out, grid, data);
    return out;
}

/// The nine-slice shape runtime (TS `createScale9ShapeRuntime`).
pub fn create_scale9_shape_runtime() -> Node2DRuntime {
    return create_shape_runtime();
}

/// The construction initializer of `create_scale9_shape_data`.
pub fn initialize_scale9_shape_data(
    out: &mut Scale9ShapeData,
    grid: &ShapeScale9Grid,
    data: Option<&PartialScale9ShapeData>,
) {
    out.commands = data
        .and_then(|data| data.commands.clone())
        .unwrap_or_default();
    out.scale9_grid = *grid;
    out.bounds_state = data
        .and_then(|data| data.bounds_state.clone())
        .unwrap_or_else(new_shape_bounds_state);
}

/// Reads the nine-slice shape runtime (TS `getScale9ShapeRuntime`).
pub fn get_scale9_shape_runtime(
    source: &dyn flight_node::contract::Node,
) -> Option<ShapeRuntimeRef> {
    return shape_runtime_of(source);
}
