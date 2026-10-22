//! Nine-slice shape kinds (TS `scale9Shape.ts`).
// flight-lint: allow-file(f64) D1: shape command tokens, path geometry and morph progress use the canonical f64 Path lane; matrices stay f32

use flight_entity::{Ref, allocate_entity};
use flight_scene2d::contract::{Node2DRuntime, create_node2d};

use crate::shape::create_shape_runtime;
use crate::shape::create_shape_runtime_extra;
use crate::types::*;

/// Creates a nine-slice shape around a grid (TS `createScale9Shape`).
// flight-lint: allow(conform-params) D23 B: authored options removed; scale9_grid is required defining ref
pub fn create_scale9_shape(scale9_grid: &ShapeScale9Grid) -> Ref<Scale9Shape> {
    let mut out: Scale9Shape = create_node2d(
        SCALE9_SHAPE_KIND.to_string(),
        Some(create_scale9_shape_runtime),
    );
    initialize_scale9_shape(&mut out, scale9_grid);
    return flight_scene2d::publish_node2d(out);
}

/// Allocates nine-slice shape data (TS `createScale9ShapeData`).
// flight-lint: allow(conform-params) D23 B: authored options removed; scale9_grid is required defining ref
pub fn create_scale9_shape_data(scale9_grid: &ShapeScale9Grid) -> Scale9ShapeData {
    let mut out: Scale9ShapeData = allocate_entity();
    initialize_scale9_shape_data(&mut out, scale9_grid);
    return out;
}

/// The nine-slice shape runtime (TS `createScale9ShapeRuntime`).
pub fn create_scale9_shape_runtime() -> Node2DRuntime {
    return create_shape_runtime();
}

/// The public initialize seam for a nine-slice shape (TS `initializeScale9Shape`).
// flight-lint: allow(conform-extra) D23 I: public initialize seam extracted from create_scale9_shape
pub fn initialize_scale9_shape(out: &mut Scale9Shape, scale9_grid: &ShapeScale9Grid) {
    out.data = create_scale9_shape_data(scale9_grid);
    let state = out.data.bounds_state.clone();
    crate::shape::set_shape_runtime_for_scale9_shape(out, create_shape_runtime_extra(&state));
}

/// The construction initializer of `create_scale9_shape_data`.
// flight-lint: allow(conform-params) D23 B: TS data param removed; Rust out-parameter IS the data
pub fn initialize_scale9_shape_data(out: &mut Scale9ShapeData, scale9_grid: &ShapeScale9Grid) {
    out.commands = Vec::new();
    out.scale9_grid = *scale9_grid;
    out.bounds_state = new_shape_bounds_state();
}

/// Reads the nine-slice shape runtime (TS `getScale9ShapeRuntime`).
pub fn get_scale9_shape_runtime(
    source: &dyn flight_node::contract::Node,
) -> Option<ShapeRuntimeRef> {
    return shape_runtime_of(source);
}
