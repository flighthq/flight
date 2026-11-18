use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

const CRATES: &[&str] = &[
    "flight-meshgeometry",
    "flight-screen",
    "flight-sensors",
    "flight-texture",
];

const EXPECTED_F32_BOUNDARIES: &[&str] = &[
    "flight-meshgeometry/src/mesh_geometry.rs::fn get_vertex_count_from_layout",
    "flight-meshgeometry/src/mesh_geometry.rs::struct MeshGeometry",
    "flight-meshgeometry/src/mesh_geometry.rs::struct MeshGeometryFields",
    "flight-meshgeometry/src/mesh_geometry.rs::struct MeshGeometryFromAttributesOptions",
    "flight-meshgeometry/src/mesh_geometry.rs::struct MeshGeometryOptions",
    "flight-meshgeometry/src/mesh_geometry.rs::struct MeshSkinBindPose",
    "flight-meshgeometry/src/mesh_geometry_attributes.rs::fn set_float2_attribute",
    "flight-meshgeometry/src/mesh_geometry_attributes.rs::fn set_float3_attribute",
    "flight-meshgeometry/src/mesh_geometry_attributes.rs::fn set_four_component_attribute",
    "flight-meshgeometry/src/mesh_geometry_attributes.rs::fn set_mesh_geometry_vertex_color0",
    "flight-meshgeometry/src/mesh_geometry_attributes.rs::fn set_mesh_geometry_vertex_joints0",
    "flight-meshgeometry/src/mesh_geometry_attributes.rs::fn set_mesh_geometry_vertex_tangent",
    "flight-meshgeometry/src/mesh_geometry_attributes.rs::fn set_mesh_geometry_vertex_uv0",
    "flight-meshgeometry/src/mesh_geometry_attributes.rs::fn set_mesh_geometry_vertex_uv1",
    "flight-meshgeometry/src/mesh_geometry_attributes.rs::fn set_mesh_geometry_vertex_weights0",
    "flight-meshgeometry/src/mesh_geometry_attributes.rs::fn vertices_as_bytes",
    "flight-meshgeometry/src/mesh_geometry_attributes.rs::fn vertices_as_bytes_mut",
    "flight-meshgeometry/src/mesh_geometry_builders.rs::fn build_canonical_mesh_geometry",
    "flight-meshgeometry/src/mesh_geometry_compute.rs::fn compute_mesh_geometry_flat_normals",
    "flight-meshgeometry/src/mesh_geometry_compute.rs::fn compute_mesh_geometry_normals",
    "flight-meshgeometry/src/mesh_geometry_compute.rs::fn compute_mesh_geometry_position_groups",
    "flight-meshgeometry/src/mesh_geometry_compute.rs::fn compute_mesh_geometry_tangents",
    "flight-meshgeometry/src/mesh_geometry_compute.rs::fn write_accumulated_tangent",
    "flight-meshgeometry/src/mesh_geometry_deformation_clone.rs::fn restore_float3",
    "flight-meshgeometry/src/mesh_geometry_index.rs::fn compact_mesh_geometry_vertices",
    "flight-meshgeometry/src/mesh_geometry_index.rs::fn expand_mesh_geometry_indices",
    "flight-meshgeometry/src/mesh_geometry_index.rs::fn vertices_as_bytes_readonly",
    "flight-meshgeometry/src/mesh_geometry_index.rs::fn weld_mesh_geometry_vertices",
    "flight-meshgeometry/src/mesh_geometry_layout.rs::fn bytes_to_f32_vec",
    "flight-meshgeometry/src/mesh_geometry_layout.rs::fn convert_mesh_geometry_layout",
    "flight-meshgeometry/src/mesh_geometry_operations.rs::fn create_mesh_geometry_from_attributes",
    "flight-meshgeometry/src/mesh_geometry_operations.rs::fn merge_mesh_geometries",
    "flight-meshgeometry/src/mesh_geometry_transforms.rs::fn restore_mirrored_winding_and_handedness",
    "flight-meshgeometry/src/mesh_geometry_transforms.rs::fn transform_mesh_geometry_into",
    "flight-meshgeometry/src/mesh_geometry_transforms.rs::fn transform_mesh_geometry_positions",
    "flight-meshgeometry/src/mesh_geometry_transforms.rs::fn translate_mesh_geometry",
    "flight-meshgeometry/src/mesh_geometry_uvs.rs::fn offset_mesh_geometry_uvs",
    "flight-meshgeometry/src/mesh_geometry_uvs.rs::fn scale_mesh_geometry_uvs",
    "flight-meshgeometry/src/morph_mesh_geometry.rs::fn blend_mesh_geometry_morph",
    "flight-meshgeometry/src/sugar.rs::fn offset_uvs",
    "flight-meshgeometry/src/sugar.rs::fn scale_uvs",
    "flight-meshgeometry/src/sugar.rs::fn set_vertex_color0",
    "flight-meshgeometry/src/sugar.rs::fn set_vertex_joints0",
    "flight-meshgeometry/src/sugar.rs::fn set_vertex_uv0",
    "flight-meshgeometry/src/sugar.rs::fn set_vertex_uv1",
    "flight-meshgeometry/src/sugar.rs::fn set_vertex_weights0",
    "flight-meshgeometry/src/vertex_format.rs::fn read_vertex_format_component",
    "flight-meshgeometry/src/vertex_format.rs::fn write_vertex_format_component",
    "flight-sensors/src/sensors.rs::fn compute_quaternion_from_orientation_reading",
    "flight-sensors/src/types.rs::struct QuaternionReading",
    "flight-texture/src/sampler.rs::fn create_anisotropic_sampler",
    "flight-texture/src/sugar.rs::fn anisotropic",
    "flight-texture/src/sugar.rs::trait TextureExt",
    "flight-texture/src/texture.rs::fn set_texture_uv_offset",
    "flight-texture/src/texture.rs::fn set_texture_uv_scale",
    "flight-texture/src/texture.rs::fn transform_texture_uv",
    "flight-texture/src/types.rs::struct Sampler",
];

fn repo_dir() -> PathBuf {
    return PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
}

fn rust_files(dir: &Path) -> Vec<PathBuf> {
    fn visit(dir: &Path, out: &mut Vec<PathBuf>) {
        for entry in fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                visit(&path, out);
            } else if path.extension().and_then(|value| value.to_str()) == Some("rs") {
                out.push(path);
            }
        }
    }

    let mut out = Vec::new();
    visit(dir, &mut out);
    out.sort();
    return out;
}

fn is_identifier_byte(value: u8) -> bool {
    return value.is_ascii_alphanumeric() || value == b'_';
}

fn has_f32_word(line: &str) -> bool {
    let bytes = line.as_bytes();
    for index in 0..bytes.len().saturating_sub(2) {
        if &bytes[index..index + 3] != b"f32" {
            continue;
        }
        let starts_word = index == 0 || !is_identifier_byte(bytes[index - 1]);
        let ends_word = index + 3 == bytes.len() || !is_identifier_byte(bytes[index + 3]);
        if starts_word && ends_word {
            return true;
        }
    }
    return false;
}

fn has_f32_suffix(line: &str) -> bool {
    let bytes = line.as_bytes();
    for index in 1..bytes.len().saturating_sub(2) {
        if &bytes[index..index + 3] == b"f32" && bytes[index - 1].is_ascii_digit() {
            return true;
        }
    }
    return false;
}

fn item_header(line: &str) -> Option<(&'static str, &str)> {
    let trimmed = line.trim_start();
    for (prefix, kind) in [
        ("pub(crate) fn ", "fn"),
        ("pub fn ", "fn"),
        ("fn ", "fn"),
        ("pub trait ", "trait"),
        ("pub struct ", "struct"),
        ("struct ", "struct"),
    ] {
        if let Some(rest) = trimmed.strip_prefix(prefix) {
            return Some((kind, rest));
        }
    }
    return None;
}

fn boundary_mask_and_id(
    relative: &str,
    lines: &[&str],
    marker: usize,
) -> (Vec<bool>, String) {
    let reason = lines[marker]
        .split_once("allow(f32)")
        .map(|(_, value)| value.trim())
        .unwrap_or_default();
    assert!(!reason.is_empty(), "{relative}:{} needs a reason", marker + 1);

    let mut item = marker + 1;
    let (kind, rest) = loop {
        let Some(line) = lines.get(item) else {
            panic!("{relative}:{} marker has no following item", marker + 1);
        };
        if let Some(header) = item_header(line) {
            break header;
        }
        item += 1;
    };
    let name: String = rest
        .chars()
        .take_while(|value| value.is_ascii_alphanumeric() || *value == '_')
        .collect();
    assert!(!name.is_empty());

    let mut start = marker;
    while start > 0 {
        let previous = lines[start - 1].trim_start();
        if previous.starts_with("//") || previous.starts_with("#[") {
            start -= 1;
        } else {
            break;
        }
    }

    let mut depth = 0_i32;
    let mut saw_open = false;
    let mut end = item;
    for (index, line) in lines.iter().enumerate().skip(item) {
        for value in line.bytes() {
            if value == b'{' {
                depth += 1;
                saw_open = true;
            } else if value == b'}' {
                depth -= 1;
            }
        }
        end = index;
        if saw_open && depth == 0 {
            break;
        }
    }
    assert!(saw_open, "{relative}:{} item has no body", item + 1);
    let mut mask = vec![false; lines.len()];
    for allowed in &mut mask[start..=end] {
        *allowed = true;
    }
    return (mask, format!("{relative}::{kind} {name}"));
}

#[test]
fn freezes_the_exact_reasoned_f32_boundary_inventory() {
    let repo = repo_dir();
    let mut actual = BTreeSet::new();
    for crate_name in CRATES {
        let source_dir = repo.join("crates").join(crate_name).join("src");
        for path in rust_files(&source_dir) {
            let source = fs::read_to_string(&path).unwrap();
            let lines: Vec<&str> = source.lines().collect();
            let relative = path.strip_prefix(repo.join("crates")).unwrap();
            let relative = relative.to_string_lossy().replace('\\', "/");
            for (index, line) in lines.iter().enumerate() {
                if line.contains("flight-lint: allow(f32)") {
                    let (_, id) = boundary_mask_and_id(&relative, &lines, index);
                    assert!(actual.insert(id.clone()), "duplicate boundary {id}");
                }
            }
        }
    }
    let expected: BTreeSet<String> = EXPECTED_F32_BOUNDARIES
        .iter()
        .map(|value| (*value).to_string())
        .collect();
    assert_eq!(actual, expected);
}

#[test]
fn rejects_every_unclassified_f32_occurrence() {
    let repo = repo_dir();
    let mut failures = Vec::new();
    for crate_name in CRATES {
        let source_dir = repo.join("crates").join(crate_name).join("src");
        for path in rust_files(&source_dir) {
            let source = fs::read_to_string(&path).unwrap();
            let lines: Vec<&str> = source.lines().collect();
            let relative = path.strip_prefix(repo.join("crates")).unwrap();
            let relative = relative.to_string_lossy().replace('\\', "/");
            let mut allowed = vec![false; lines.len()];
            for (index, line) in lines.iter().enumerate() {
                if line.contains("flight-lint: allow(f32)") {
                    let (item_mask, _) = boundary_mask_and_id(&relative, &lines, index);
                    for (target, item) in allowed.iter_mut().zip(item_mask) {
                        *target |= item;
                    }
                }
            }
            for (index, line) in lines.iter().enumerate() {
                if (has_f32_word(line) || has_f32_suffix(line)) && !allowed[index] {
                    failures.push(format!("{relative}:{}: {}", index + 1, line.trim()));
                }
            }
        }
    }
    assert!(
        failures.is_empty(),
        "unclassified f32 syntax remains outside the exact boundary inventory:\n{}",
        failures.join("\n")
    );
}
