use std::collections::HashMap;
use std::sync::Arc;

use flight_clip::create_clip_region_from_path;
use flight_entity::throw_error;
use flight_geometry::{Matrix, create_matrix, inverse_matrix, multiply_matrix};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_path::{Path, PathWinding, create_path};
use flight_path_boolean::{PathBooleanKernel, PathBooleanOptions, intersect_paths, simplify_path};
use flight_scene2d::Node2DRef;

use crate::rive_core_types::is_rive_core_type_derived_from;
use crate::rive_import_registry::{
    import_rive_core_object_as_data, register_rive_core_object_handler,
};
use crate::types::*;

// flight-lint: allow(f64) Flight Path.data is the canonical f64 geometry lane; Rive's f32 component transforms are losslessly promoted when writing it
fn create_rive_clip_path(
    path_boolean_kernel: &PathBooleanKernel,
    paths: &[RivePathRecord],
    clipped: &Matrix,
    source: &Matrix,
    clipping: &RiveCoreObject,
) -> Path {
    let identity = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    let mut into = identity.clone();
    let mut combined = identity.clone();
    if inverse_matrix(&mut into, clipped) {
        multiply_matrix(&mut combined, &into, source);
    } else {
        multiply_matrix(&mut combined, &identity, source);
    }

    let winding = if read_rive_number(clipping, RIVE_CLIP_FILL_RULE, 0.0) == 1.0 {
        PathWinding::EvenOdd
    } else {
        PathWinding::NonZero
    };
    let mut path = create_path(Some(flight_path::PathWinding::NonZero));
    path.winding = winding;
    for record in paths {
        path.commands.extend_from_slice(&record.commands);
        for point in record.data.chunks_exact(2) {
            let x = point[0];
            let y = point[1];
            path.data
                .push((combined.a * x + combined.c * y + combined.tx) as f64);
            path.data
                .push((combined.b * x + combined.d * y + combined.ty) as f64);
        }
    }

    let mut resolved = create_path(Some(flight_path::PathWinding::NonZero));
    simplify_path(
        &mut resolved,
        path_boolean_kernel,
        &path,
        Some(&PathBooleanOptions {
            fill_rule: Some(path.winding),
            tolerance: None,
        }),
    );
    return resolved;
}

fn create_rive_local_matrix(source: &RiveCoreObject) -> Matrix {
    let rotation = read_rive_number(source, RIVE_ROTATION, 0.0);
    let scale_x = read_rive_number(source, RIVE_SCALE_X, 1.0);
    let scale_y = read_rive_number(source, RIVE_SCALE_Y, 1.0);
    let cosine = rotation.cos();
    let sine = rotation.sin();
    return create_matrix(
        cosine * scale_x,
        sine * scale_x,
        -sine * scale_y,
        cosine * scale_y,
        read_rive_number(source, RIVE_X, read_rive_number(source, RIVE_X_LEGACY, 0.0)),
        read_rive_number(source, RIVE_Y, read_rive_number(source, RIVE_Y_LEGACY, 0.0)),
    );
}

fn create_rive_relative_transforms(artboard: &RiveArtboardGraph) -> Vec<Matrix> {
    if artboard.objects.is_empty() {
        return Vec::new();
    }
    let identity = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    let mut transforms = vec![identity.clone(); artboard.objects.len()];
    let mut states = vec![0_u8; artboard.objects.len()];
    let mut pending = Vec::new();
    transforms[0] = identity;
    states[0] = RIVE_TRANSFORM_RESOLVED;
    for index in 1..artboard.objects.len() {
        let mut current = index;
        while states[current] != RIVE_TRANSFORM_RESOLVED {
            if states[current] == RIVE_TRANSFORM_RESOLVING {
                throw_error(&format!("Rive component parent cycle at index {current}."));
            }
            states[current] = RIVE_TRANSFORM_RESOLVING;
            pending.push(current);
            let Some(parent) = artboard.parent_indices.get(current).copied() else {
                throw_error(&format!(
                    "Rive component {current} has unresolved parent undefined."
                ));
            };
            if parent == RIVE_NO_PARENT {
                break;
            }
            let Ok(parent_index) = usize::try_from(parent) else {
                throw_error(&format!(
                    "Rive component {current} has unresolved parent {parent}."
                ));
            };
            if parent_index >= artboard.objects.len() {
                throw_error(&format!(
                    "Rive component {current} has unresolved parent {parent}."
                ));
            }
            current = parent_index;
        }
        while let Some(current) = pending.pop() {
            let object = &artboard.objects[current];
            let parent = artboard.parent_indices[current];
            let inherited = usize::try_from(parent).ok().map_or_else(
                || transforms[0].clone(),
                |parent| transforms[parent].clone(),
            );
            if !is_rive_core_type_derived_from(object.type_key as i32, RIVE_NODE_TYPE_KEY) {
                transforms[current] = inherited;
            } else {
                let local = create_rive_local_matrix(object);
                let mut world = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
                multiply_matrix(&mut world, &inherited, &local);
                transforms[current] = world;
            }
            states[current] = RIVE_TRANSFORM_RESOLVED;
        }
    }
    return transforms;
}

pub fn apply_rive_clipping(
    path_boolean_kernel: &PathBooleanKernel,
    nodes: &[Option<Node2DRef>],
    artboard: &RiveArtboardGraph,
    shape_paths: &HashMap<usize, Vec<RivePathRecord>>,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) {
    let relative = create_rive_relative_transforms(artboard);
    let mut clips = Vec::<(Node2DRef, Path)>::new();
    for (index, object) in artboard.objects.iter().enumerate().skip(1) {
        if object.type_key != RIVE_CLIPPING_SHAPE as u64
            || !read_rive_flag(object, RIVE_CLIP_IS_VISIBLE, true)
        {
            continue;
        }

        let owner = artboard
            .parent_indices
            .get(index)
            .copied()
            .unwrap_or(RIVE_NO_PARENT);
        let target = usize::try_from(owner)
            .ok()
            .and_then(|owner| nodes.get(owner))
            .cloned()
            .flatten();
        let Some(target) = target else {
            continue;
        };

        let source_number = read_rive_number(object, RIVE_CLIP_SOURCE_ID, -1.0);
        let source = read_rive_index(object, RIVE_CLIP_SOURCE_ID);
        let paths = source.and_then(|source| shape_paths.get(&source));
        let Some(paths) = paths.filter(|paths| !paths.is_empty()) else {
            let mut detail = HashMap::new();
            detail.insert(
                "index".to_string(),
                ImportDiagnosticDetailValue::Number(index as f32),
            );
            detail.insert(
                "source".to_string(),
                ImportDiagnosticDetailValue::Number(source_number),
            );
            report_import_diagnostic(
                diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Drop,
                "rive.unresolved-clipping-source",
                "applyRiveClipping",
                Some(detail),
            );
            continue;
        };
        let source = source.expect("a resolved source accompanies its paths");
        let Some(clipped_transform) = relative.get(owner as usize) else {
            continue;
        };
        let Some(source_transform) = relative.get(source) else {
            report_import_diagnostic(
                diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Drop,
                "rive.unresolved-clipping-source",
                "applyRiveClipping",
                None,
            );
            continue;
        };
        let next = create_rive_clip_path(
            path_boolean_kernel,
            paths,
            clipped_transform,
            source_transform,
            object,
        );
        if let Some((_, current)) = clips
            .iter_mut()
            .find(|(candidate, _)| Arc::ptr_eq(candidate, &target))
        {
            let mut intersection = create_path(Some(flight_path::PathWinding::NonZero));
            intersect_paths(&mut intersection, path_boolean_kernel, current, &next, None);
            *current = intersection;
        } else {
            clips.push((target, next));
        }
    }

    for (target, path) in clips {
        target.write().unwrap().node2d_fields_mut().clip =
            Some(create_clip_region_from_path(&path, None));
    }
}

fn read_rive_flag(source: &RiveCoreObject, key: u64, fallback: bool) -> bool {
    let value = read_rive_number(source, key, if fallback { 1.0 } else { 0.0 });
    return value != 0.0;
}

fn read_rive_index(source: &RiveCoreObject, key: u64) -> Option<usize> {
    let property = source
        .properties
        .iter()
        .find(|candidate| candidate.key == key)?;
    return match property.value {
        RiveValue::Uint(value) => usize::try_from(value).ok(),
        RiveValue::Double(value) if value.is_finite() && value >= 0.0 && value.fract() == 0.0 => {
            Some(value as usize)
        }
        RiveValue::Color(value) => usize::try_from(value).ok(),
        _ => None,
    };
}

fn read_rive_number(source: &RiveCoreObject, key: u64, fallback: f32) -> f32 {
    let Some(property) = source
        .properties
        .iter()
        .find(|candidate| candidate.key == key)
    else {
        return fallback;
    };
    return match property.value {
        RiveValue::Uint(value) => value as f32,
        RiveValue::Double(value) => value,
        RiveValue::Color(value) => value as f32,
        _ => fallback,
    };
}

pub fn register_rive_clipping_handlers(
    path_boolean_kernel: &PathBooleanKernel,
    registry: &mut RiveImportRegistry,
) {
    let path_boolean_kernel = path_boolean_kernel.clone();
    register_rive_core_object_handler(
        registry,
        RIVE_CLIPPING_SHAPE,
        Arc::new(RiveCoreObjectHandler {
            apply_artboard: Some(Arc::new(move |context| {
                apply_rive_clipping(
                    &path_boolean_kernel,
                    &context.nodes,
                    context.artboard,
                    &context.shape_paths,
                    context.diagnostics.as_deref_mut(),
                );
            })),
            apply_document: None,
            import_component: Some(Arc::new(|_, _| import_rive_core_object_as_data())),
        }),
    );
}

const RIVE_NODE_TYPE_KEY: i32 = 2;
const RIVE_CLIPPING_SHAPE: i32 = 42;
const RIVE_X_LEGACY: u64 = 9;
const RIVE_Y_LEGACY: u64 = 10;
const RIVE_X: u64 = 13;
const RIVE_Y: u64 = 14;
const RIVE_ROTATION: u64 = 15;
const RIVE_SCALE_X: u64 = 16;
const RIVE_SCALE_Y: u64 = 17;
const RIVE_CLIP_SOURCE_ID: u64 = 92;
const RIVE_CLIP_FILL_RULE: u64 = 93;
const RIVE_CLIP_IS_VISIBLE: u64 = 94;
const RIVE_NO_PARENT: i32 = -1;
const RIVE_TRANSFORM_RESOLVING: u8 = 1;
const RIVE_TRANSFORM_RESOLVED: u8 = 2;
