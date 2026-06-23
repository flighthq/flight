//! Scale-9 shape variant.
//!
//! A scale-9 shape is a [`DisplayObjectArena`] node of kind
//! [`scale9_shape_kind`] whose boxed payload is a [`Scale9ShapeData`] — a shape
//! command buffer plus a `scale9_grid` rectangle that describes the fixed-size
//! inner region. Renderers use the grid to stretch only the outer zones while
//! keeping corners and edge slices at their authored dimensions.

use flighthq_displayobject::{
    DisplayObjectArena, DisplayObjectRuntime, create_display_object_generic,
};
use flighthq_node::NodeId;
use flighthq_types::{Rectangle, Scale9ShapeData, scale9_shape_kind};

use crate::shape::create_shape_runtime;

/// Runtime behavior for a scale-9 shape.
///
/// Mirrors TS `Scale9ShapeRuntime`, which is the plain `ShapeRuntime`: scale-9
/// bounds are computed from the same command buffer, so the runtime delegates to
/// the shape bounds-compute function (see [`create_scale9_shape_runtime`]).
pub type Scale9ShapeRuntime = DisplayObjectRuntime;

// ---------------------------------------------------------------------------
// Public functions (alphabetical)
// ---------------------------------------------------------------------------

/// Inserts a new scale-9 shape node into `arena` with the given `scale9_grid`
/// and returns its id.
///
/// Mirrors TS `createScale9Shape`: builds a display object of kind
/// [`scale9_shape_kind`] with a [`Scale9ShapeData`] payload via
/// `createDisplayObjectGeneric`.
pub fn create_scale9_shape(arena: &mut DisplayObjectArena, scale9_grid: Rectangle) -> NodeId {
    let data: Box<dyn std::any::Any + Send + Sync> =
        Box::new(create_scale9_shape_data(scale9_grid));
    create_display_object_generic(arena, scale9_shape_kind(), Some(data))
}

/// Builds a `Scale9ShapeData` payload with an empty command buffer and the given
/// `scale9_grid`.
///
/// Mirrors TS `createScale9ShapeData(scale9Grid)`.
pub fn create_scale9_shape_data(scale9_grid: Rectangle) -> Scale9ShapeData {
    Scale9ShapeData {
        commands: Vec::new(),
        scale9_grid,
    }
}

/// Builds the runtime behavior for a scale-9 shape.
///
/// Mirrors TS `createScale9ShapeRuntime()`, which returns `createShapeRuntime()`.
pub fn create_scale9_shape_runtime() -> Scale9ShapeRuntime {
    create_shape_runtime()
}

/// Returns the runtime behavior for the scale-9 shape at `source`.
///
/// Mirrors TS `getScale9ShapeRuntime(source)`. A scale-9 shape's runtime is the
/// shape bounds-compute function (the same one [`create_scale9_shape_runtime`]
/// installs), returned directly for the same reason as [`crate::shape::get_shape_runtime`].
pub fn get_scale9_shape_runtime(
    _arena: &DisplayObjectArena,
    _source: NodeId,
) -> Scale9ShapeRuntime {
    create_scale9_shape_runtime()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    use crate::shape::create_shape;
    use crate::shape_commands::append_shape_rectangle;
    use flighthq_geometry::create_rectangle;
    use flighthq_types::scale9_shape_kind;

    fn new_arena() -> DisplayObjectArena {
        DisplayObjectArena::default()
    }

    // create_scale9_shape

    #[test]
    fn create_scale9_shape_uses_scale9_kind() {
        use flighthq_displayobject::get_display_object_kind;
        let mut arena = new_arena();
        let grid = create_rectangle(10.0, 10.0, 80.0, 80.0);
        let shape = create_scale9_shape(&mut arena, grid);
        assert_eq!(get_display_object_kind(&arena, shape), scale9_shape_kind());
    }

    #[test]
    fn create_scale9_shape_returns_new_id_each_call() {
        let mut arena = new_arena();
        let grid = create_rectangle(10.0, 10.0, 80.0, 80.0);
        let a = create_scale9_shape(&mut arena, grid);
        let b = create_scale9_shape(&mut arena, grid);
        assert_ne!(a, b);
    }

    // create_scale9_shape_data

    #[test]
    fn create_scale9_shape_data_stores_grid_and_empty_commands() {
        let grid = create_rectangle(10.0, 10.0, 80.0, 80.0);
        let data = create_scale9_shape_data(grid);
        assert_eq!(data.scale9_grid, grid);
        assert_eq!(data.commands.len(), 0);
    }

    // create_scale9_shape_runtime

    #[test]
    fn create_scale9_shape_runtime_computes_shape_bounds() {
        // The scale-9 runtime is the shape bounds-compute function; exercise it
        // against a shape command buffer (the same buffer both nodes carry).
        let runtime = create_scale9_shape_runtime();
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_rectangle(&mut arena, shape, 5.0, 6.0, 20.0, 10.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        runtime.expect("scale9 shape runtime")(&mut out, &arena, shape);
        assert_eq!(out.x, 5.0);
        assert_eq!(out.width, 20.0);
        assert_eq!(out.height, 10.0);
    }

    // get_scale9_shape_runtime

    #[test]
    fn get_scale9_shape_runtime_returns_compute_fn() {
        let mut arena = new_arena();
        let grid = create_rectangle(0.0, 0.0, 10.0, 10.0);
        let shape = create_scale9_shape(&mut arena, grid);
        let runtime = get_scale9_shape_runtime(&arena, shape);
        // Same compute function as the shape runtime; exercise via a shape node.
        let s = create_shape(&mut arena);
        append_shape_rectangle(&mut arena, s, 0.0, 0.0, 4.0, 8.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        runtime.expect("scale9 shape runtime")(&mut out, &arena, s);
        assert_eq!(out.width, 4.0);
        assert_eq!(out.height, 8.0);
    }
}
