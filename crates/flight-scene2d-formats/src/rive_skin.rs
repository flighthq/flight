use flight_geometry::{
    Matrix, create_matrix, create_vector2, inverse_matrix_transform_point_xy,
    matrix_transform_point_xy,
};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_skeleton2d::contract::{Skin2D, create_skin_2d};

use crate::rive_core_types::is_rive_core_type_derived_from;
use crate::types::{
    RiveArtboardGraph, RiveCoreObject, RiveValue, RiveWeightedPoint, RiveWeightedPointKind,
};

struct RiveTendonBone {
    bind: Matrix,
    bone_index: i32,
}

// flight-lint: allow(conform-array) D9 array negotiation: TS readonly number arrays map to canonical Rust slices
pub fn create_rive_skin_2d(
    artboard: &RiveArtboardGraph,
    skinnable_index: usize,
    bone_indices: &[i32],
    points: &[RiveWeightedPoint],
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Skin2D> {
    let skin_index = find_rive_skin(artboard, skinnable_index)?;
    let skin_world = read_rive_matrix(
        &artboard.objects[skin_index],
        RIVE_SKIN_XX,
        RIVE_SKIN_YX,
        RIVE_SKIN_XY,
        RIVE_SKIN_YY,
    );
    let tendons = collect_rive_tendon_bones(artboard, skin_index, bone_indices);
    let mut bind_space = create_vector2(0.0, 0.0);
    let mut bone_space = create_vector2(0.0, 0.0);
    let mut influence_counts = vec![0_u16; points.len()];
    let mut influences = Vec::new();
    for (position, point) in points.iter().enumerate() {
        let Some(weight_index) = find_rive_weight(artboard, point.vertex) else {
            continue;
        };
        let Some((indices, values)) =
            read_rive_weight_slots(&artboard.objects[weight_index], point.kind)
        else {
            continue;
        };
        matrix_transform_point_xy(&mut bind_space, &skin_world, point.x, point.y);
        let mut written = 0;
        for slot in 0..RIVE_INFLUENCES_PER_WEIGHT {
            let amount = read_rive_packed_byte(values, slot);
            if amount == 0 {
                continue;
            }
            let tendon = read_rive_packed_byte(indices, slot);
            if tendon == RIVE_IDENTITY_BONE_SLOT || usize::from(tendon) > tendons.len() {
                report_import_diagnostic(
                    diagnostics.as_deref_mut(),
                    ImportDiagnosticSeverity::Drop,
                    "rive.unresolved-weight-bone",
                    "createRiveSkin2D",
                    Some(std::collections::HashMap::from([
                        (
                            "index".to_string(),
                            ImportDiagnosticDetailValue::Number(f32::from(tendon)),
                        ),
                        (
                            "vertex".to_string(),
                            ImportDiagnosticDetailValue::Number(point.vertex as f32),
                        ),
                    ])),
                );
                continue;
            }
            let resolved = &tendons[usize::from(tendon) - 1];
            inverse_matrix_transform_point_xy(
                &mut bone_space,
                &resolved.bind,
                bind_space.x,
                bind_space.y,
            );
            influences.extend_from_slice(&[
                resolved.bone_index as f32,
                bone_space.x,
                bone_space.y,
                f32::from(amount) / RIVE_WEIGHT_SCALE,
            ]);
            written += 1;
        }
        influence_counts[position] = written;
    }
    return Some(create_skin_2d(influence_counts, influences));
}

fn collect_rive_tendon_bones(
    artboard: &RiveArtboardGraph,
    skin_index: usize,
    bone_indices: &[i32],
) -> Vec<RiveTendonBone> {
    let mut tendons = Vec::new();
    for index in skin_index + 1..artboard.objects.len() {
        let object = &artboard.objects[index];
        if object.type_key != RIVE_TENDON || artboard.parent_indices[index] != skin_index as i32 {
            continue;
        }
        let bone = read_rive_integer(object, RIVE_TENDON_BONE_ID, -1);
        tendons.push(RiveTendonBone {
            bind: read_rive_matrix(
                object,
                RIVE_TENDON_XX,
                RIVE_TENDON_YX,
                RIVE_TENDON_XY,
                RIVE_TENDON_YY,
            ),
            bone_index: usize::try_from(bone)
                .ok()
                .and_then(|bone| bone_indices.get(bone))
                .copied()
                .unwrap_or(-1),
        });
    }
    return tendons;
}

fn find_rive_skin(artboard: &RiveArtboardGraph, skinnable_index: usize) -> Option<usize> {
    return (skinnable_index + 1..artboard.objects.len()).find(|index| {
        artboard.objects[*index].type_key == RIVE_SKIN
            && artboard.parent_indices[*index] == skinnable_index as i32
    });
}

fn find_rive_weight(artboard: &RiveArtboardGraph, vertex_index: usize) -> Option<usize> {
    return (vertex_index + 1..artboard.objects.len()).find(|index| {
        if artboard.parent_indices[*index] != vertex_index as i32 {
            return false;
        }
        return i32::try_from(artboard.objects[*index].type_key)
            .is_ok_and(|key| is_rive_core_type_derived_from(key, RIVE_WEIGHT));
    });
}

fn read_rive_integer(source: &RiveCoreObject, key: u64, fallback: i32) -> i32 {
    let Some(property) = source
        .properties
        .iter()
        .find(|candidate| candidate.key == key)
    else {
        return fallback;
    };
    return match property.value {
        RiveValue::Uint(value) => i32::try_from(value).unwrap_or(fallback),
        RiveValue::Color(value) => i32::try_from(value).unwrap_or(fallback),
        RiveValue::Double(value) if value.is_finite() => value as i32,
        _ => fallback,
    };
}

fn read_rive_matrix(
    source: &RiveCoreObject,
    xx_key: u64,
    yx_key: u64,
    xy_key: u64,
    yy_key: u64,
) -> Matrix {
    return create_matrix(
        read_rive_number(source, xx_key, 1.0),
        read_rive_number(source, xy_key, 0.0),
        read_rive_number(source, yx_key, 0.0),
        read_rive_number(source, yy_key, 1.0),
        read_rive_number(source, xx_key + RIVE_MATRIX_TX_OFFSET, 0.0),
        read_rive_number(source, xx_key + RIVE_MATRIX_TY_OFFSET, 0.0),
    );
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
        RiveValue::Color(value) => value as f32,
        RiveValue::Double(value) => value,
        _ => fallback,
    };
}

fn read_rive_packed_byte(packed: u32, slot: u32) -> u8 {
    return ((packed >> (slot * 8)) & 0xff) as u8;
}

fn read_rive_uint32(source: &RiveCoreObject, key: u64, fallback: u32) -> u32 {
    let Some(property) = source
        .properties
        .iter()
        .find(|candidate| candidate.key == key)
    else {
        return fallback;
    };
    return match property.value {
        RiveValue::Uint(value) => u32::try_from(value).unwrap_or(fallback),
        RiveValue::Color(value) => value,
        RiveValue::Double(value) if value.is_finite() && value >= 0.0 => value as u32,
        _ => fallback,
    };
}

fn read_rive_weight_slots(
    weight: &RiveCoreObject,
    kind: RiveWeightedPointKind,
) -> Option<(u32, u32)> {
    if kind == RiveWeightedPointKind::Point {
        return Some((
            read_rive_uint32(weight, RIVE_WEIGHT_INDICES, 0),
            read_rive_uint32(weight, RIVE_WEIGHT_VALUES, 0),
        ));
    }
    if !i32::try_from(weight.type_key)
        .is_ok_and(|key| is_rive_core_type_derived_from(key, RIVE_CUBIC_WEIGHT))
    {
        return None;
    }
    if kind == RiveWeightedPointKind::In {
        return Some((
            read_rive_uint32(weight, RIVE_WEIGHT_IN_INDICES, 0),
            read_rive_uint32(weight, RIVE_WEIGHT_IN_VALUES, 0),
        ));
    }
    return Some((
        read_rive_uint32(weight, RIVE_WEIGHT_OUT_INDICES, 0),
        read_rive_uint32(weight, RIVE_WEIGHT_OUT_VALUES, 0),
    ));
}

const RIVE_CUBIC_WEIGHT: i32 = 46;
const RIVE_IDENTITY_BONE_SLOT: u8 = 0;
const RIVE_INFLUENCES_PER_WEIGHT: u32 = 4;
const RIVE_MATRIX_TX_OFFSET: u64 = 4;
const RIVE_MATRIX_TY_OFFSET: u64 = 5;
const RIVE_SKIN: u64 = 43;
const RIVE_SKIN_XX: u64 = 104;
const RIVE_SKIN_XY: u64 = 106;
const RIVE_SKIN_YX: u64 = 105;
const RIVE_SKIN_YY: u64 = 107;
const RIVE_TENDON: u64 = 44;
const RIVE_TENDON_BONE_ID: u64 = 95;
const RIVE_TENDON_XX: u64 = 96;
const RIVE_TENDON_XY: u64 = 98;
const RIVE_TENDON_YX: u64 = 97;
const RIVE_TENDON_YY: u64 = 99;
const RIVE_WEIGHT: i32 = 45;
const RIVE_WEIGHT_IN_INDICES: u64 = 111;
const RIVE_WEIGHT_IN_VALUES: u64 = 110;
const RIVE_WEIGHT_INDICES: u64 = 103;
const RIVE_WEIGHT_OUT_INDICES: u64 = 113;
const RIVE_WEIGHT_OUT_VALUES: u64 = 112;
const RIVE_WEIGHT_SCALE: f32 = 255.0;
const RIVE_WEIGHT_VALUES: u64 = 102;
