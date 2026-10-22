use crate::gltf_source::GltfSource;
use flight_encoding::decode_utf8;
use flight_entity::Uint8Array;
use serde_json::Value;

pub const GLTF_FEATURE_NAMES: &[&str] = &["Animation", "Camera", "Mesh", "Skin"];

// flight-lint: allow(conform-params) Principal7f9bbcf6 D24: required first ordered feature output clears/fills existing storage; bool preserves null versus readable empty set
pub fn collect_glb_features(out: &mut Vec<String>, bytes: &Uint8Array) -> bool {
    out.clear();
    let Some(json) = extract_glb_json_chunk(bytes) else {
        return false;
    };
    return collect_gltf_features(
        out,
        GltfSource::Json(crate::gltf_source::GltfJsonSource { source: &json }),
    );
}

// flight-lint: allow(conform-params) Principal7f9bbcf6 D24: required first ordered feature output clears/fills existing storage retaining capacity; bool preserves nullable result
pub fn collect_gltf_features(out: &mut Vec<String>, source: GltfSource<'_>) -> bool {
    out.clear();
    match source {
        GltfSource::Document(source) => {
            let doc = source.source.read().unwrap();
            if doc.asset.is_none() {
                return false;
            }
            for (feature, present) in [
                (
                    "Mesh",
                    doc.meshes.as_ref().is_some_and(|rows| !rows.is_empty()),
                ),
                (
                    "Animation",
                    doc.animations.as_ref().is_some_and(|rows| !rows.is_empty()),
                ),
                (
                    "Camera",
                    doc.cameras.as_ref().is_some_and(|rows| !rows.is_empty()),
                ),
                (
                    "Skin",
                    doc.skins.as_ref().is_some_and(|rows| !rows.is_empty()),
                ),
            ] {
                if present {
                    out.push(feature.to_string());
                }
            }
            if let Some(extensions) = &doc.extensions_used {
                for extension in extensions {
                    push_gltf_feature(out, extension);
                }
            }
        }
        GltfSource::Json(source) => {
            let Ok(doc) = serde_json::from_str::<Value>(source.source) else {
                return false;
            };
            if !doc.is_object()
                || !doc
                    .get("asset")
                    .and_then(|asset| asset.get("version"))
                    .is_some_and(Value::is_string)
            {
                return false;
            }
            for (feature, member) in [
                ("Mesh", "meshes"),
                ("Animation", "animations"),
                ("Camera", "cameras"),
                ("Skin", "skins"),
            ] {
                if doc
                    .get(member)
                    .and_then(Value::as_array)
                    .is_some_and(|rows| !rows.is_empty())
                {
                    out.push(feature.to_string());
                }
            }
            if let Some(extensions) = doc.get("extensionsUsed").and_then(Value::as_array) {
                for extension in extensions {
                    if let Some(extension) = extension.as_str() {
                        push_gltf_feature(out, extension);
                    }
                }
            }
        }
    }
    return true;
}

pub fn extract_glb_json_chunk(bytes: &Uint8Array) -> Option<String> {
    if bytes.len() < 12 {
        return None;
    }
    if read_glb_word(bytes, 0) != 0x4654_6c67 || read_glb_word(bytes, 4) != 2 {
        return None;
    }
    let end = (read_glb_word(bytes, 8) as usize).min(bytes.len());
    let mut offset = 12;
    while offset <= end && end - offset >= 8 {
        let chunk_length = read_glb_word(bytes, offset) as usize;
        let chunk_type = read_glb_word(bytes, offset + 4);
        let data_start = offset + 8;
        if chunk_length > end - data_start {
            break;
        }
        let data_end = data_start + chunk_length;
        if chunk_type == 0x4e4f_534a {
            let mut result = decode_utf8(&bytes[data_start..data_end], None, None);
            if result.starts_with('\u{feff}') {
                result.remove(0);
            }
            return Some(result);
        }
        offset = data_end;
    }
    return None;
}

fn push_gltf_feature(out: &mut Vec<String>, feature: &str) {
    if !out.iter().any(|entry| entry == feature) {
        out.push(feature.to_string());
    }
}

fn read_glb_word(bytes: &Uint8Array, offset: usize) -> u32 {
    return u32::from_le_bytes([
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
        bytes[offset + 3],
    ]);
}
