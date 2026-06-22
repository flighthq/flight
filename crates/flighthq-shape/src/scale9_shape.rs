//! Scale-9 shape variant.
//!
//! A [`Scale9ShapeNode`] is a `ShapeNode` with an additional `scale9_grid`
//! rectangle that describes the fixed-size inner region. Renderers use the
//! grid to stretch only the outer zones while keeping corners and edge slices
//! at their authored dimensions.

use flighthq_node::{NodeArena, NodeId};
use flighthq_types::{Rectangle, Scale9ShapeData};

use crate::shape::{ShapeRuntime, create_shape_runtime};

/// Runtime behavior for a scale-9 shape.
///
/// Mirrors TS `Scale9ShapeRuntime`, which is the plain `ShapeRuntime`: scale-9
/// bounds are computed from the same command buffer, so the runtime delegates to
/// the shape bounds-compute function (see [`create_scale9_shape_runtime`]).
pub type Scale9ShapeRuntime = ShapeRuntime;

// ---------------------------------------------------------------------------
// Scale9ShapeNode
// ---------------------------------------------------------------------------

/// A shape node whose stretchable fill is constrained by a scale-9 grid.
///
/// The `data` field mirrors [`ShapeNode::data`] but carries the additional
/// `scale9_grid` rectangle.
#[derive(Debug, Default)]
pub struct Scale9ShapeNode {
    /// Drawing command buffer and scale-9 grid.
    pub data: Scale9ShapeData,
    /// Bumped when geometry (commands or grid) changes.
    pub bounds_revision: u32,
    /// Bumped when render content (commands) changes.
    pub content_revision: u32,
}

/// Arena of [`Scale9ShapeNode`] values, keyed by [`NodeId`].
pub type Scale9ShapeArena = NodeArena<Scale9ShapeNode>;

// ---------------------------------------------------------------------------
// Public functions (alphabetical)
// ---------------------------------------------------------------------------

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

/// Creates a new `Scale9ShapeNode` in `arena` with the given `scale9_grid`
/// and returns its `NodeId`.
pub fn create_scale9_shape_node(arena: &mut Scale9ShapeArena, scale9_grid: Rectangle) -> NodeId {
    arena.insert(Scale9ShapeNode {
        data: Scale9ShapeData {
            commands: Vec::new(),
            scale9_grid,
        },
        bounds_revision: 0,
        content_revision: 0,
    })
}

/// Builds the runtime behavior for a scale-9 shape.
///
/// Mirrors TS `createScale9ShapeRuntime()`, which returns `createShapeRuntime()`.
pub fn create_scale9_shape_runtime() -> Scale9ShapeRuntime {
    create_shape_runtime()
}

/// Returns the runtime behavior for the scale-9 shape at `source`.
///
/// Mirrors TS `getScale9ShapeRuntime(source)`. The returned function is the
/// shape bounds-compute method (the same one [`create_scale9_shape_runtime`]
/// installs).
pub fn get_scale9_shape_runtime(_arena: &Scale9ShapeArena, _source: NodeId) -> Scale9ShapeRuntime {
    create_shape_runtime()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    use crate::shape::{ShapeArena, create_shape_node};
    use crate::shape_commands::append_shape_rectangle;
    use flighthq_geometry::create_rectangle;

    // create_scale9_shape_data

    #[test]
    fn create_scale9_shape_data_stores_grid_and_empty_commands() {
        let grid = create_rectangle(10.0, 10.0, 80.0, 80.0);
        let data = create_scale9_shape_data(grid);
        assert_eq!(data.scale9_grid, grid);
        assert_eq!(data.commands.len(), 0);
    }

    // create_scale9_shape_node

    #[test]
    fn create_scale9_shape_node_stores_grid() {
        let mut arena = Scale9ShapeArena::default();
        let grid = create_rectangle(10.0, 10.0, 80.0, 80.0);
        let shape = create_scale9_shape_node(&mut arena, grid);
        assert_eq!(arena[shape].data.scale9_grid, grid);
    }

    #[test]
    fn create_scale9_shape_node_initializes_empty_commands() {
        let mut arena = Scale9ShapeArena::default();
        let grid = create_rectangle(10.0, 10.0, 80.0, 80.0);
        let shape = create_scale9_shape_node(&mut arena, grid);
        assert_eq!(arena[shape].data.commands.len(), 0);
    }

    #[test]
    fn create_scale9_shape_node_returns_new_id_each_call() {
        let mut arena = Scale9ShapeArena::default();
        let grid = create_rectangle(10.0, 10.0, 80.0, 80.0);
        let a = create_scale9_shape_node(&mut arena, grid);
        let b = create_scale9_shape_node(&mut arena, grid);
        assert_ne!(a, b);
    }

    // create_scale9_shape_runtime

    #[test]
    fn create_scale9_shape_runtime_computes_shape_bounds() {
        // The scale-9 runtime is the shape bounds-compute function; exercise it
        // against a shape command buffer (the same buffer both nodes carry).
        let runtime = create_scale9_shape_runtime();
        let mut arena = ShapeArena::default();
        let shape = create_shape_node(&mut arena);
        append_shape_rectangle(&mut arena, shape, 5.0, 6.0, 20.0, 10.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        runtime(&arena, shape, &mut out);
        assert_eq!(out.x, 5.0);
        assert_eq!(out.width, 20.0);
        assert_eq!(out.height, 10.0);
    }

    // get_scale9_shape_runtime

    #[test]
    fn get_scale9_shape_runtime_returns_compute_fn() {
        let mut arena = Scale9ShapeArena::default();
        let grid = create_rectangle(0.0, 0.0, 10.0, 10.0);
        let shape = create_scale9_shape_node(&mut arena, grid);
        let runtime = get_scale9_shape_runtime(&arena, shape);
        // Same compute function as the shape runtime; exercise via a shape arena.
        let mut shape_arena = ShapeArena::default();
        let s = create_shape_node(&mut shape_arena);
        append_shape_rectangle(&mut shape_arena, s, 0.0, 0.0, 4.0, 8.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        runtime(&shape_arena, s, &mut out);
        assert_eq!(out.width, 4.0);
        assert_eq!(out.height, 8.0);
    }
}
