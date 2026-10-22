use crate::three_ds_schema::*;
use flight_entity::Uint8Array;

/// An insertion-ordered row of the source ReadonlyMap<number, number>.
#[derive(Debug, PartialEq, Eq)]
pub struct ThreeDsChunkCount {
    pub chunk_id: u16,
    pub count: usize,
}

const THREE_DS_CHUNK_NAMES: [(u16, &str); 9] = [
    (THREE_DS_TRIMESH, "Trimesh"),
    (THREE_DS_MATERIAL, "Material"),
    (THREE_DS_MATERIAL_TEXTURE_MAP, "MaterialTextureMap"),
    (THREE_DS_MATERIAL_OPACITY_MAP, "MaterialOpacityMap"),
    (THREE_DS_MATERIAL_BUMP_MAP, "MaterialBumpMap"),
    (THREE_DS_LIGHT, "Light"),
    (THREE_DS_LIGHT_SPOT, "LightSpot"),
    (THREE_DS_CAMERA, "Camera"),
    (THREE_DS_KEYFRAME_OBJECT_NODE, "KeyframeObjectNode"),
];

// flight-lint: allow(conform-params) Principal21f7557f approved D24: required first caller-owned output; boolean retains the source nullable-result success distinction
pub fn collect_three_ds_chunk_counts(
    out: &mut Vec<ThreeDsChunkCount>,
    source: &Uint8Array,
) -> bool {
    out.clear();
    if source.len() < THREE_DS_CHUNK_HEADER_BYTES || read_three_ds_u16(source, 0) != THREE_DS_MAIN {
        return false;
    }
    walk_three_ds_chunk_census(source, 0, out);
    return true;
}

fn count_three_ds_chunk(counts: &mut Vec<ThreeDsChunkCount>, chunk_id: u16) {
    if let Some(row) = counts.iter_mut().find(|row| row.chunk_id == chunk_id) {
        row.count += 1;
    } else {
        counts.push(ThreeDsChunkCount { chunk_id, count: 1 });
    }
}

pub fn get_three_ds_chunk_name(chunk_id: u16) -> String {
    return THREE_DS_CHUNK_NAMES
        .iter()
        .find(|row| row.0 == chunk_id)
        .map(|row| row.1.to_string())
        .unwrap_or_else(|| format!("Unknown(0x{chunk_id:04x})"));
}

// flight-lint: allow(conform-params) Principal21f7557f approved D24: required first caller-owned collection out, cleared then filled
pub fn get_three_ds_feature_names(out: &mut Vec<String>) {
    out.clear();
    out.extend(THREE_DS_CHUNK_NAMES.iter().map(|row| row.1.to_string()));
    return;
}

fn read_three_ds_u16(bytes: &Uint8Array, offset: usize) -> u16 {
    return u16::from_le_bytes(bytes[offset..offset + 2].try_into().unwrap());
}

fn read_three_ds_u32(bytes: &Uint8Array, offset: usize) -> u32 {
    return u32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap());
}

fn walk_three_ds_chunk_census(
    bytes: &Uint8Array,
    offset: usize,
    counts: &mut Vec<ThreeDsChunkCount>,
) {
    let length = read_three_ds_u32(bytes, offset + 2) as usize;
    if length < THREE_DS_CHUNK_HEADER_BYTES {
        return;
    }
    let end = (offset + length).min(bytes.len());
    let mut cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;
    while cursor + THREE_DS_CHUNK_HEADER_BYTES <= end {
        let chunk_id = read_three_ds_u16(bytes, cursor);
        let child_length = read_three_ds_u32(bytes, cursor + 2) as usize;
        if child_length < THREE_DS_CHUNK_HEADER_BYTES {
            break;
        }
        let chunk_end = cursor + child_length;
        if chunk_end > end {
            break;
        }
        if [THREE_DS_MAIN, THREE_DS_EDITOR, THREE_DS_KEYFRAME].contains(&chunk_id) {
            walk_three_ds_chunk_census(bytes, cursor, counts);
        } else if chunk_id == THREE_DS_OBJECT {
            walk_three_ds_object_census(bytes, cursor, end, counts);
        } else if chunk_id == THREE_DS_MATERIAL {
            count_three_ds_chunk(counts, THREE_DS_MATERIAL);
            walk_three_ds_material_census(bytes, cursor, chunk_end, counts);
        } else if chunk_id == THREE_DS_KEYFRAME_OBJECT_NODE {
            count_three_ds_chunk(counts, THREE_DS_KEYFRAME_OBJECT_NODE);
        }
        cursor = chunk_end;
    }
}

fn walk_three_ds_light_census(
    bytes: &Uint8Array,
    offset: usize,
    parent_end: usize,
    counts: &mut Vec<ThreeDsChunkCount>,
) {
    let end = (offset + read_three_ds_u32(bytes, offset + 2) as usize).min(parent_end);
    let mut cursor = offset + THREE_DS_CHUNK_HEADER_BYTES + 12;
    while cursor + THREE_DS_CHUNK_HEADER_BYTES <= end {
        let chunk_id = read_three_ds_u16(bytes, cursor);
        let child_length = read_three_ds_u32(bytes, cursor + 2) as usize;
        if child_length < THREE_DS_CHUNK_HEADER_BYTES {
            break;
        }
        let chunk_end = cursor + child_length;
        if chunk_end > end {
            break;
        }
        if chunk_id == THREE_DS_LIGHT_SPOT {
            count_three_ds_chunk(counts, THREE_DS_LIGHT_SPOT);
            return;
        }
        cursor = chunk_end;
    }
}

fn walk_three_ds_material_census(
    bytes: &Uint8Array,
    offset: usize,
    parent_end: usize,
    counts: &mut Vec<ThreeDsChunkCount>,
) {
    let end = (offset + read_three_ds_u32(bytes, offset + 2) as usize).min(parent_end);
    let mut cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;
    while cursor + THREE_DS_CHUNK_HEADER_BYTES <= end {
        let chunk_id = read_three_ds_u16(bytes, cursor);
        let child_length = read_three_ds_u32(bytes, cursor + 2) as usize;
        if child_length < THREE_DS_CHUNK_HEADER_BYTES {
            break;
        }
        let chunk_end = cursor + child_length;
        if chunk_end > end {
            break;
        }
        if [
            THREE_DS_MATERIAL_TEXTURE_MAP,
            THREE_DS_MATERIAL_BUMP_MAP,
            THREE_DS_MATERIAL_OPACITY_MAP,
        ]
        .contains(&chunk_id)
        {
            count_three_ds_chunk(counts, chunk_id);
        }
        cursor = chunk_end;
    }
}

fn walk_three_ds_object_census(
    bytes: &Uint8Array,
    offset: usize,
    parent_end: usize,
    counts: &mut Vec<ThreeDsChunkCount>,
) {
    let length = read_three_ds_u32(bytes, offset + 2) as usize;
    if length < THREE_DS_CHUNK_HEADER_BYTES {
        return;
    }
    let end = (offset + length).min(parent_end);
    let mut cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;
    while cursor < end && bytes[cursor] != 0 {
        cursor += 1;
    }
    cursor += 1;
    while cursor + THREE_DS_CHUNK_HEADER_BYTES <= end {
        let chunk_id = read_three_ds_u16(bytes, cursor);
        let child_length = read_three_ds_u32(bytes, cursor + 2) as usize;
        if child_length < THREE_DS_CHUNK_HEADER_BYTES {
            break;
        }
        let chunk_end = cursor + child_length;
        if chunk_end > end {
            break;
        }
        if chunk_id == THREE_DS_TRIMESH || chunk_id == THREE_DS_CAMERA {
            count_three_ds_chunk(counts, chunk_id);
            return;
        }
        if chunk_id == THREE_DS_LIGHT {
            count_three_ds_chunk(counts, THREE_DS_LIGHT);
            walk_three_ds_light_census(bytes, cursor, chunk_end, counts);
            return;
        }
        cursor = chunk_end;
    }
}
