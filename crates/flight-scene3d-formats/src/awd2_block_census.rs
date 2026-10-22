use crate::awd2_header::parse_awd2_header;
use crate::awd2_parse::rehydrate_awd2_body;
use crate::awd2_schema::*;
use crate::three_ds_read::read_three_ds_u32;
use flight_compression::{HostDecompressDeflateCapability, HostDecompressLzmaCapability};
use flight_entity::Uint8Array;
use std::sync::{Arc, RwLock};

#[derive(Debug, PartialEq, Eq)]
pub struct Awd2BlockCount {
    pub name: String,
    pub count: usize,
}

const AWD2_BLOCK_NAMES: [(u8, &str); 13] = [
    (AWD2_BLOCK_TRIANGLE_GEOMETRY, "TriangleGeometry"),
    (AWD2_BLOCK_CONTAINER, "Container"),
    (AWD2_BLOCK_MESH_INSTANCE, "MeshInstance"),
    (AWD2_BLOCK_LIGHT, "Light"),
    (AWD2_BLOCK_CAMERA, "Camera"),
    (AWD2_BLOCK_LIGHT_PICKER, "LightPicker"),
    (AWD2_BLOCK_MATERIAL, "Material"),
    (AWD2_BLOCK_TEXTURE, "Texture"),
    (AWD2_BLOCK_SKELETON, "Skeleton"),
    (AWD2_BLOCK_SKELETON_POSE, "SkeletonPose"),
    (AWD2_BLOCK_SKELETON_ANIMATION, "SkeletonAnimation"),
    (AWD2_BLOCK_SKELETON_CLIP_NODE, "SkeletonClipNode"),
    (AWD2_BLOCK_ANIMATION_SET, "AnimationSet"),
];

// flight-lint: allow(conform-params) Principal21f7557f approved D24: required first caller-owned output; boolean retains the source nullable-result success distinction
pub fn collect_awd2_block_counts(
    out: &mut Vec<Awd2BlockCount>,
    source: &Uint8Array,
    deflate: Option<&HostDecompressDeflateCapability>,
    lzma: Option<&HostDecompressLzmaCapability>,
) -> bool {
    out.clear();
    let Some(header) = parse_awd2_header(source, deflate, lzma) else {
        return false;
    };
    if header.compression == AWD2_COMPRESSION_NONE {
        return count_awd2_blocks(out, source);
    }
    let input = Arc::new(RwLock::new(source.to_vec().into_boxed_slice()));
    let Some(rehydrated) = rehydrate_awd2_body(&input, deflate, lzma, None) else {
        return false;
    };
    return count_awd2_blocks(out, &rehydrated.source.read().unwrap());
}

fn count_awd2_blocks(counts: &mut Vec<Awd2BlockCount>, data: &Uint8Array) -> bool {
    counts.clear();
    let mut pos = AWD2_HEADER_BYTES;
    while pos + AWD2_BLOCK_HEADER_BYTES <= data.len() {
        let namespace = data[pos + 4];
        let block_type = data[pos + 5];
        let block_length = read_three_ds_u32(data, pos + 7) as usize;
        pos += AWD2_BLOCK_HEADER_BYTES;
        if block_length > data.len() - pos {
            counts.clear();
            return false;
        }
        pos += block_length;
        let name = get_awd2_block_name(namespace, block_type);
        if let Some(entry) = counts.iter_mut().find(|entry| entry.name == name) {
            entry.count += 1;
        } else {
            counts.push(Awd2BlockCount { name, count: 1 });
        }
    }
    return true;
}

pub fn get_awd2_block_name(namespace: u8, block_type: u8) -> String {
    if namespace != AWD2_NAMESPACE_CORE {
        return format!("Namespace{namespace}Block({block_type})");
    }
    return AWD2_BLOCK_NAMES
        .iter()
        .find(|row| row.0 == block_type)
        .map(|row| row.1.to_string())
        .unwrap_or_else(|| format!("Unknown({block_type})"));
}

// flight-lint: allow(conform-params) Principal21f7557f approved D24: required first caller-owned collection out, cleared then filled
pub fn get_awd2_feature_names(out: &mut Vec<String>) {
    out.clear();
    out.extend(AWD2_BLOCK_NAMES.iter().map(|row| row.1.to_string()));
    return;
}
