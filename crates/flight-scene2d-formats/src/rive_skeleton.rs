use std::sync::Arc;

use flight_entity::allocate_entity;
use flight_math::RAD_TO_DEG;
use flight_skeleton2d::contract::{
    Bone2D, Skeleton2D, TRANSFORM_MODE_2D_NORMAL, create_skeleton_2d,
};

use crate::rive_core_types::is_rive_core_type_derived_from;
use crate::rive_import_registry::{
    import_rive_core_object_as_data, register_rive_core_object_handler,
};
use crate::types::*;

fn create_rive_bone_2d(
    source: &RiveCoreObject,
    parent_index: i32,
    objects: &[RiveCoreObject],
    artboard: &RiveArtboardGraph,
    component: usize,
) -> Bone2D {
    let is_root = i32::try_from(source.type_key)
        .is_ok_and(|key| is_rive_core_type_derived_from(key, RIVE_ROOT_BONE));
    let parent_component = artboard.parent_indices[component];
    let parent_length = usize::try_from(parent_component)
        .ok()
        .and_then(|index| objects.get(index))
        .map(|parent| read_rive_number(parent, RIVE_BONE_LENGTH, 0.0))
        .unwrap_or(0.0);
    return Bone2D {
        length: read_rive_number(source, RIVE_BONE_LENGTH, 0.0),
        name: Some(read_rive_text(source, RIVE_NAME, "")),
        parent_index,
        rotation: read_rive_number(source, RIVE_ROTATION, 0.0) * RAD_TO_DEG,
        scale_x: read_rive_number(source, RIVE_SCALE_X, 1.0),
        scale_y: read_rive_number(source, RIVE_SCALE_Y, 1.0),
        shear_x: 0.0,
        shear_y: 0.0,
        transform_mode: TRANSFORM_MODE_2D_NORMAL,
        x: if is_root {
            read_rive_number(source, RIVE_ROOT_BONE_X, 0.0)
        } else if parent_index == NO_BONE {
            0.0
        } else {
            parent_length
        },
        y: if is_root {
            read_rive_number(source, RIVE_ROOT_BONE_Y, 0.0)
        } else {
            0.0
        },
    };
}

pub fn create_rive_skeleton_2d(artboard: &RiveArtboardGraph) -> Option<RiveSkeleton2DImport> {
    let objects = &artboard.objects;
    let mut bone_indices = vec![NO_BONE; objects.len()];
    let components = objects
        .iter()
        .enumerate()
        .filter_map(|(index, object)| {
            i32::try_from(object.type_key)
                .is_ok_and(|key| is_rive_core_type_derived_from(key, RIVE_BONE))
                .then_some(index)
        })
        .collect::<Vec<_>>();
    if components.is_empty() {
        return None;
    }

    let mut ordered = components;
    ordered.sort_by_key(|component| (to_rive_component_depth(artboard, *component), *component));
    for (position, component) in ordered.iter().enumerate() {
        bone_indices[*component] = i32::try_from(position).unwrap_or(NO_BONE);
    }
    let bones = ordered
        .iter()
        .map(|component| {
            let parent_index = usize::try_from(artboard.parent_indices[*component])
                .ok()
                .and_then(|parent| bone_indices.get(parent))
                .copied()
                .unwrap_or(NO_BONE);
            return create_rive_bone_2d(
                &objects[*component],
                parent_index,
                objects,
                artboard,
                *component,
            );
        })
        .collect();
    let mut out: RiveSkeleton2DImport = allocate_entity();
    initialize_rive_skeleton_2d_import(&mut out, bone_indices, create_skeleton_2d(bones));
    return Some(out);
}

pub fn initialize_rive_skeleton_2d_import(
    out: &mut RiveSkeleton2DImport,
    bone_indices: Vec<i32>,
    skeleton: Skeleton2D,
) {
    out.bone_indices = bone_indices;
    out.skeleton = skeleton;
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

fn read_rive_text(source: &RiveCoreObject, key: u64, fallback: &str) -> String {
    let Some(property) = source
        .properties
        .iter()
        .find(|candidate| candidate.key == key)
    else {
        return fallback.to_string();
    };
    return match &property.value {
        RiveValue::String(value) => value.clone(),
        _ => fallback.to_string(),
    };
}

pub fn register_rive_skeleton_handlers(registry: &mut RiveImportRegistry) {
    let skeleton = Arc::new(RiveCoreObjectHandler {
        apply_artboard: Some(Arc::new(|context| {
            context.skeleton = create_rive_skeleton_2d(context.artboard);
        })),
        apply_document: None,
        import_component: Some(Arc::new(|_, _| import_rive_core_object_as_data())),
    });
    for type_key in RIVE_SKELETON_TYPE_KEYS {
        register_rive_core_object_handler(registry, type_key, skeleton.clone());
    }
}

fn to_rive_component_depth(artboard: &RiveArtboardGraph, index: usize) -> usize {
    let mut depth = 0;
    let mut parent = artboard.parent_indices[index];
    while parent >= 0 && depth <= artboard.objects.len() {
        depth += 1;
        let Some(next) = usize::try_from(parent)
            .ok()
            .and_then(|parent| artboard.parent_indices.get(parent))
        else {
            break;
        };
        parent = *next;
    }
    return depth;
}

const RIVE_SKELETAL_COMPONENT: i32 = 39;
const RIVE_BONE: i32 = 40;
const RIVE_SKIN: i32 = 43;
const RIVE_TENDON: i32 = 44;
const RIVE_WEIGHT: i32 = 45;
const RIVE_SKELETON_TYPE_KEYS: [i32; 4] =
    [RIVE_SKELETAL_COMPONENT, RIVE_SKIN, RIVE_TENDON, RIVE_WEIGHT];
const RIVE_ROOT_BONE: i32 = 41;

const RIVE_NAME: u64 = 4;
const RIVE_ROTATION: u64 = 15;
const RIVE_SCALE_X: u64 = 16;
const RIVE_SCALE_Y: u64 = 17;
const RIVE_BONE_LENGTH: u64 = 89;
const RIVE_ROOT_BONE_X: u64 = 90;
const RIVE_ROOT_BONE_Y: u64 = 91;

const NO_BONE: i32 = -1;
