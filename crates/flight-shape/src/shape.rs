//! The plain shape kind (TS `shape.ts`): creation, retained stream edits, and bounds integration.
// flight-lint: allow-file(f64) D1: shape command tokens, path geometry and morph progress use the canonical f64 Path lane; matrices stay f32
// flight-lint: allow-file(contract-vocabulary) D16 open shape family: ShapeNode bounds and structural node dispatch on the shape command/bounds surface are contract dispatch, not arbitrary vocabulary types

use std::sync::Arc;

use flight_entity::{Ref, allocate_entity};
use flight_geometry::Rectangle;
use flight_node::contract::{Node, NodeRef, invalidate_content};
use flight_scene2d::contract::{
    Node2DRuntime, Node2DRuntimeMethods, create_node2d, create_node2d_runtime,
};

use crate::shape_bounds::{compute_shape_bounds_rectangle, shape_bounds_state_of};
use crate::shape_bounds_registry::get_shape_bounds_command_registry_revision;
use crate::types::*;

/// Creates a shape (TS `createShape`).
// flight-lint: allow(conform-params) D23 B: authored options removed; kind assigns fields after create
pub fn create_shape() -> Ref<Shape> {
    let mut out: Shape = create_node2d(
        SHAPE_KIND.to_string(),
        Some(create_shape_runtime),
    );
    out.data = create_shape_data();
    let state = out.data.bounds_state.clone();
    set_shape_runtime_for_shape(&mut out, create_shape_runtime_extra(&state));
    return flight_scene2d::publish_node2d(out);
}

/// Allocates shape kind data (TS `createShapeData`).
// flight-lint: allow(conform-params) D23 B: authored options removed
pub fn create_shape_data() -> ShapeData {
    let mut out: ShapeData = allocate_entity();
    initialize_shape_data(&mut out);
    return out;
}

/// The shape's runtime extra: the installed bounds methods plus the registry revision stamp (TS
/// `createShapeRuntime`).
pub fn create_shape_runtime() -> Node2DRuntime {
    let methods = Node2DRuntimeMethods {
        compute_local_bounds_rectangle: Some(Arc::new(|out: &mut Rectangle, source: &dyn Node| {
            crate::shape::compute_shape_local_bounds_rectangle(out, source);
        })),
        is_local_bounds_rectangle_valid: Some(Arc::new(|source: &dyn Node| {
            return is_shape_local_bounds_rectangle_valid(source);
        })),
    };
    return create_node2d_runtime(Some(&methods));
}

/// The shape's runtime extra value with the registry revision cleared.
pub(crate) fn create_shape_runtime_extra(state: &ShapeBoundsStateRef) -> ShapeRuntimeRef {
    return Arc::new(std::sync::RwLock::new(ShapeRuntime {
        bounds_state: state.clone(),
        shape_bounds_command_registry_revision: -1,
    }));
}

/// The public initialize seam for a shape (TS `initializeShape`).
// flight-lint: allow(conform-extra) D23 I: public initialize seam extracted from create_shape
pub fn initialize_shape(_out: &mut Shape) {}

/// The construction initializer of `create_shape_data`.
pub fn initialize_shape_data(out: &mut ShapeData) {
    out.commands = Vec::new();
    out.bounds_state = new_shape_bounds_state();
}

/// Clears the retained command stream (TS `clearShapeCommands`).
pub fn clear_shape_commands<T: ShapeNode + 'static>(shape: &Ref<T>) {
    {
        let mut guard = shape.write().unwrap();
        guard.shape_commands_mut().clear();
        guard.clear_shape_paint_bindings();
    }
    invalidate(shape);
}

/// Writes the shape's local bounds rectangle (TS `computeShapeLocalBoundsRectangle`).
pub fn compute_shape_local_bounds_rectangle(out: &mut Rectangle, source: &dyn Node) {
    get_shape_bounds(out, source, Some(ShapeBoundsMode::Ink));
}

/// Copies another shape's command stream into `out` (TS `copyShapeCommands`).
pub fn copy_shape_commands<T: ShapeNode + 'static>(out: &Ref<T>, source: &dyn Node) {
    let source_commands = match shape_commands_of(source) {
        Some(commands) => commands.clone(),
        None => Vec::new(),
    };
    {
        let mut guard = out.write().unwrap();
        let target = guard.shape_commands_mut();
        target.clear();
        target.extend_from_slice(&source_commands);
        guard.clear_shape_paint_bindings();
    }
    invalidate(out);
}

/// Writes the shape's bounds and reports completeness (TS `getShapeBounds`). Incomplete traversals
/// zero the box so callers cannot mistake partial output for truth.
pub fn get_shape_bounds(
    out: &mut Rectangle,
    source: &dyn Node,
    mode: Option<ShapeBoundsMode>,
) -> bool {
    let complete = compute_shape_bounds_rectangle(out, source, mode);
    if let (Some(runtime), Some(state)) = (shape_runtime_of(source), shape_bounds_state_of(source))
    {
        runtime
            .write()
            .unwrap()
            .shape_bounds_command_registry_revision =
            get_shape_bounds_command_registry_revision(&state) as i64;
    }
    if !complete {
        out.x = 0.0;
        out.y = 0.0;
        out.width = 0.0;
        out.height = 0.0;
    }
    return complete;
}

/// The number of drawing commands in the stream (TS `getShapeCommandCount`).
pub fn get_shape_command_count(source: &dyn Node) -> usize {
    let Some(commands) = shape_commands_of(source) else {
        return 0;
    };
    let mut count = 0;
    let mut index = 0;
    while index < commands.len() {
        let argument_count = commands[index + 1].as_number().unwrap_or(0.0) as usize;
        count += 1;
        index += argument_count + 2;
    }
    return count;
}

/// Reads the shape's runtime extra (TS `getShapeRuntime`).
pub fn get_shape_runtime(source: &dyn Node) -> Option<ShapeRuntimeRef> {
    return shape_runtime_of(source);
}

pub(crate) fn invalidate<T: ShapeNode + 'static>(shape: &Ref<T>) {
    let node: NodeRef = shape.clone();
    invalidate_content(&node);
}

/// True when the shape has no drawing commands (TS `isShapeEmpty`).
pub fn is_shape_empty(source: &dyn Node) -> bool {
    return shape_commands_of(source)
        .map(|commands| commands.is_empty())
        .unwrap_or(true);
}

/// True when the cached local bounds still match the registry revision (TS
/// `isShapeLocalBoundsRectangleValid`).
pub(crate) fn is_shape_local_bounds_rectangle_valid(source: &dyn Node) -> bool {
    let Some(runtime) = shape_runtime_of(source) else {
        return false;
    };
    let Some(state) = shape_bounds_state_of(source) else {
        return false;
    };
    let stamp = runtime
        .read()
        .unwrap()
        .shape_bounds_command_registry_revision;
    return stamp == get_shape_bounds_command_registry_revision(&state) as i64;
}

pub(crate) fn set_shape_runtime_for_morph_shape(shape: &mut MorphShape, runtime: ShapeRuntimeRef) {
    shape.shape_runtime = runtime;
}

pub(crate) fn set_shape_runtime_for_scale9_shape(
    shape: &mut Scale9Shape,
    runtime: ShapeRuntimeRef,
) {
    shape.shape_runtime = runtime;
}

pub(crate) fn set_shape_runtime_for_shape(shape: &mut Shape, runtime: ShapeRuntimeRef) {
    shape.shape_runtime = runtime;
}

pub(crate) fn shape_commands_of(source: &dyn Node) -> Option<&Vec<ShapeCommandToken>> {
    return crate::types::shape_commands(source);
}
