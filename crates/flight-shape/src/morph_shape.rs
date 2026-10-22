//! Retained morph shapes: prepared path morphs sampled into live commands (TS `morphShape.ts`).
// flight-lint: allow-file(f64) D1: shape command tokens, path geometry and morph progress use the canonical f64 Path lane; matrices stay f32

use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_node::contract::{NodeRef, invalidate_content};
use flight_path::{Path, PathMorph, PathWinding, create_path, sample_path_morph};
use flight_scene2d::contract::{Node2DRuntime, create_node2d};

use crate::morph_shape_paint::sample_morph_shape_paint_bindings;
use crate::shape::create_shape_runtime;
use crate::shape::create_shape_runtime_extra;
use crate::shape_commands::append_shape_path;
use crate::types::*;

/// Creates a retained morph shape around a prepared path morph (TS `createMorphShape`).
// flight-lint: allow(conform-params) D23 B: authored options removed; morph is required defining ref
pub fn create_morph_shape(morph: &Ref<PathMorph>) -> Ref<MorphShape> {
    let mut out: MorphShape = create_node2d(
        MORPH_SHAPE_KIND.to_string(),
        None,
        Some(create_morph_shape_runtime),
    );
    initialize_morph_shape(&mut out, morph);
    return flight_scene2d::publish_node2d(out);
}

/// Allocates morph shape data (TS `createMorphShapeData`).
// flight-lint: allow(conform-params) D23 B: authored options removed; morph is required defining ref
pub fn create_morph_shape_data(morph: &Ref<PathMorph>) -> MorphShapeData {
    let mut out: MorphShapeData = allocate_entity();
    initialize_morph_shape_data(&mut out, morph);
    return out;
}

/// The morph shape runtime (TS `createMorphShapeRuntime`).
pub fn create_morph_shape_runtime() -> Node2DRuntime {
    return create_shape_runtime();
}

/// The public initialize seam for a morph shape (TS `initializeMorphShape`).
// flight-lint: allow(conform-extra) D23 I: public initialize seam extracted from create_morph_shape
pub fn initialize_morph_shape(out: &mut MorphShape, morph: &Ref<PathMorph>) {
    out.data = create_morph_shape_data(morph);
    let state = out.data.bounds_state.clone();
    crate::shape::set_shape_runtime_for_morph_shape(out, create_shape_runtime_extra(&state));
}

/// The construction initializer of `create_morph_shape_data`.
// flight-lint: allow(conform-params) D23 B: TS data param removed; Rust out-parameter IS the data
pub fn initialize_morph_shape_data(
    out: &mut MorphShapeData,
    morph: &Ref<PathMorph>,
) {
    let progress = 0.0;
    let winding = morph.read().unwrap().winding;
    let mut path_value = create_path();
    path_value.winding = winding;
    let path: Ref<Path> = Arc::new(RwLock::new(path_value));
    let path_bindings: Vec<MorphShapePathBinding> = vec![MorphShapePathBinding {
        command_index: 0,
        morph: morph.clone(),
        path: path.clone(),
    }];
    for binding in &path_bindings {
        sample_path_morph(
            &mut binding.path.write().unwrap(),
            &binding.morph.read().unwrap(),
            progress,
        );
    }
    out.commands = Vec::new();
    out.morph = morph.clone();
    out.paint_bindings = Vec::new();
    out.path = path;
    out.path_bindings = path_bindings;
    out.progress = progress;
    out.bounds_state = new_shape_bounds_state();
    sample_morph_shape_paint_bindings(out, progress);
}

/// Adds a stable sampled path at the current command position (TS `appendMorphShapePath`).
pub fn append_morph_shape_path(shape: &Ref<MorphShape>, morph: &Ref<PathMorph>) -> Ref<Path> {
    let (path, command_index) = {
        let mut guard = shape.write().unwrap();
        let existing = guard
            .data
            .path_bindings
            .iter()
            .find(|binding| Arc::ptr_eq(&binding.morph, morph))
            .map(|binding| binding.path.clone());
        let path = match existing {
            Some(path) => path,
            None => {
                let winding = morph.read().unwrap().winding;
                let mut value = create_path();
                value.winding = winding;
                let path: Ref<Path> = Arc::new(RwLock::new(value));
                let progress = guard.data.progress;
                sample_path_morph(&mut path.write().unwrap(), &morph.read().unwrap(), progress);
                let command_index = guard.data.commands.len();
                guard.data.path_bindings.push(MorphShapePathBinding {
                    command_index,
                    morph: morph.clone(),
                    path: path.clone(),
                });
                path
            }
        };
        let command_index = guard
            .data
            .path_bindings
            .iter()
            .find(|binding| Arc::ptr_eq(&binding.morph, morph))
            .map(|binding| binding.command_index)
            .unwrap_or(guard.data.commands.len());
        (path, command_index)
    };
    let (commands, data, winding) = {
        let guard = path.read().unwrap();
        (guard.commands.clone(), guard.data.clone(), guard.winding)
    };
    {
        let mut guard = shape.write().unwrap();
        let command_index = guard.data.commands.len();
        if let Some(binding) = guard
            .data
            .path_bindings
            .iter_mut()
            .find(|binding| Arc::ptr_eq(&binding.morph, morph))
        {
            binding.command_index = command_index;
        }
    }
    append_shape_path(shape, &commands, &data, Some(winding));
    let _ = command_index;
    return path;
}

/// The retained primary path (TS `shape.data.path`); a crate-internal accessor the paint and
/// parity passes read, kept rather than inlined so the source accessor has one home.
#[allow(dead_code)]
pub(crate) fn get_morph_shape_path(source: &MorphShape) -> Ref<Path> {
    return source.data.path.clone();
}

/// Reads the morph shape runtime (TS `getMorphShapeRuntime`).
pub fn get_morph_shape_runtime(
    source: &dyn flight_node::contract::Node,
) -> Option<ShapeRuntimeRef> {
    return shape_runtime_of(source);
}

/// Re-writes a drawPath command from its sampled path (Rust adaptation: the canonical Path owns its
/// buffers, so the command holds a snapshot refreshed on every sample).
pub(crate) fn resync_path_commands(data: &mut MorphShapeData, binding: &MorphShapePathBinding) {
    let index = binding.command_index;
    if index + 4 >= data.commands.len() {
        return;
    }
    if data.commands[index].as_str() != Some("drawPath") {
        return;
    }
    let path = binding.path.read().unwrap();
    let command_values: Vec<f64> = path.commands.iter().map(|value| *value as f64).collect();
    data.commands[index + 2] = ShapeCommandToken::Numbers(ShapeCommandNumbers {
        values: command_values,
    });
    data.commands[index + 3] = ShapeCommandToken::Numbers(ShapeCommandNumbers {
        values: path.data.clone(),
    });
    data.commands[index + 4] = ShapeCommandToken::String(String::from(match path.winding {
        PathWinding::EvenOdd => "evenOdd",
        PathWinding::NonZero => "nonZero",
    }));
}

/// Samples changed progress into every retained path and paint value (TS
/// `setMorphShapeProgress`).
// flight-lint: allow(f64) D1: path morph progress is a JS number interpolated by the f64 path lane
pub fn set_morph_shape_progress(shape: &Ref<MorphShape>, progress: f64) {
    {
        let mut guard = shape.write().unwrap();
        if guard.data.progress == progress {
            return;
        }
        guard.data.progress = progress;
        let bindings: Vec<MorphShapePathBinding> = guard.data.path_bindings.clone();
        for binding in &bindings {
            sample_path_morph(
                &mut binding.path.write().unwrap(),
                &binding.morph.read().unwrap(),
                progress,
            );
            resync_path_commands(&mut guard.data, binding);
        }
        sample_morph_shape_paint_bindings(&mut guard.data, progress);
    }
    let node: NodeRef = shape.clone();
    invalidate_content(&node);
}
