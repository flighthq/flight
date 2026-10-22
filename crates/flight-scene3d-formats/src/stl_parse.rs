use crate::shared::{CANONICAL_FLOATS_PER_VERTEX, CANONICAL_LAYOUT};
use crate::stl_features::{
    BINARY_STL_HEADER_SIZE, BINARY_STL_TRIANGLE_SIZE, count_ascii_stl_facets, is_stl_whitespace,
    parse_stl_number, read_binary_stl_triangle_count,
};
use flight_encoding::decode_utf8;
use flight_entity::Uint8Array;
use flight_meshgeometry::{MeshGeometry, MeshGeometryOptions, create_mesh_geometry};

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::stl_test_helper::{StlFixtureFacet, build_binary_stl};

    #[test]
    fn options_receiver_matches_both_normal_policy_free_calls() {
        let facets = [StlFixtureFacet {
            normal: [0.0, 0.0, -1.0],
            vertices: [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
        }];
        let bytes = build_binary_stl(&facets, None);
        for normals in [
            StlNormalPolicy::FileNormals,
            StlNormalPolicy::RecomputeFromVertices,
        ] {
            let options = StlImportOptions {
                normals: Some(normals),
            };
            let method = options.parse(&bytes).unwrap();
            let free = parse_stl(&bytes, Some(&options)).unwrap();
            assert_eq!(method.vertices, free.vertices);
            assert_eq!(
                method.vertices[5],
                if normals == StlNormalPolicy::FileNormals {
                    -1.0
                } else {
                    1.0
                }
            );
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct StlImportOptions {
    pub normals: Option<StlNormalPolicy>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StlNormalPolicy {
    FileNormals,
    RecomputeFromVertices,
}

// flight-lint: allow(f64) STL source numbers remain double through cross products and normal normalization before canonical Float32Array writes; private parse record only
struct StlFacet {
    normal: [f64; 3],
    vertices: [[f64; 3]; 3],
}

pub const STL_FULL_IMPORT_OPTIONS: StlImportOptions = StlImportOptions {
    normals: Some(StlNormalPolicy::RecomputeFromVertices),
};

fn build_stl_geometry(facets: &[StlFacet], policy: StlNormalPolicy) -> Option<MeshGeometry> {
    if facets.is_empty() {
        return None;
    }
    let mut vertices = vec![0.0; facets.len() * 3 * CANONICAL_FLOATS_PER_VERTEX].into_boxed_slice();
    let mut offset = 0;
    for facet in facets {
        let normal = resolve_facet_normal(facet, policy);
        for vertex in &facet.vertices {
            for component in 0..3 {
                vertices[offset + component] = vertex[component] as f32;
                vertices[offset + component + 3] = normal[component] as f32;
            }
            offset += CANONICAL_FLOATS_PER_VERTEX;
        }
    }
    return Some(create_mesh_geometry(MeshGeometryOptions {
        vertices,
        layout: CANONICAL_LAYOUT.clone(),
        indices: None,
        subsets: None,
        topology: None,
    }));
}

// flight-lint: allow(f64) source cross products must precede Float32Array rounding; finite binary32 edge products can exceed binary32 (1e20 squared)
fn compute_facet_normal(facet: &StlFacet) -> [f64; 3] {
    let [a, b, c] = facet.vertices;
    let ab_x = b[0] - a[0];
    let ab_y = b[1] - a[1];
    let ab_z = b[2] - a[2];
    let ac_x = c[0] - a[0];
    let ac_y = c[1] - a[1];
    let ac_z = c[2] - a[2];
    return normalize_vector([
        ab_y * ac_z - ab_z * ac_y,
        ab_z * ac_x - ab_x * ac_z,
        ab_x * ac_y - ab_y * ac_x,
    ]);
}

// flight-lint: allow(conform-extra) D9 exact string conversion for source StlNormalPolicy union
pub fn get_stl_normal_policy_string(value: StlNormalPolicy) -> &'static str {
    return match value {
        StlNormalPolicy::FileNormals => "FileNormals",
        StlNormalPolicy::RecomputeFromVertices => "RecomputeFromVertices",
    };
}

// flight-lint: allow(f64) source Number.isFinite squared-length branch must not overflow early in f32; private STL adapter, normalized result cast at canonical Float32Array write
fn normalize_vector(vector: [f64; 3]) -> [f64; 3] {
    let squared = vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2];
    if !squared.is_finite() || squared == 0.0 {
        return [0.0; 3];
    }
    let scale = 1.0 / squared.sqrt();
    return [vector[0] * scale, vector[1] * scale, vector[2] * scale];
}

pub fn parse_stl(bytes: &Uint8Array, options: Option<&StlImportOptions>) -> Option<MeshGeometry> {
    let policy = options
        .and_then(|options| options.normals)
        .unwrap_or(StlNormalPolicy::RecomputeFromVertices);
    if let Some(count) = read_binary_stl_triangle_count(bytes) {
        return build_stl_geometry(&read_binary_stl_facets(bytes, count), policy);
    }
    let text = decode_utf8(bytes, None, None);
    count_ascii_stl_facets(&text)?;
    return build_stl_geometry(&read_ascii_stl_facets(&text), policy);
}

// flight-lint: allow(conform-extra) D9 exact string conversion for source StlNormalPolicy union
pub fn parse_stl_normal_policy(value: &str) -> Option<StlNormalPolicy> {
    return match value {
        "FileNormals" => Some(StlNormalPolicy::FileNormals),
        "RecomputeFromVertices" => Some(StlNormalPolicy::RecomputeFromVertices),
        _ => None,
    };
}

// flight-lint: allow(f64) ASCII source numeric triples parsed as JS Number before Float32Array conversion; preserve source header-token walk and undefined-to-NaN behavior
fn read_ascii_stl_facets(text: &str) -> Vec<StlFacet> {
    let tokens: Vec<&str> = text
        .trim_matches(is_stl_whitespace)
        .split(is_stl_whitespace)
        .filter(|word| !word.is_empty())
        .collect();
    let triple = |start: usize| -> [f64; 3] {
        return std::array::from_fn(|offset| {
            tokens
                .get(start + offset)
                .map_or(f64::NAN, |token| parse_stl_number(token))
        });
    };
    let mut facets = Vec::new();
    let mut index = 0;
    while index < tokens.len() {
        if !tokens[index].eq_ignore_ascii_case("facet") {
            index += 1;
            continue;
        }
        let normal = triple(index + 2);
        let mut cursor = index + 7;
        let mut vertices = [[0.0; 3]; 3];
        for vertex in &mut vertices {
            *vertex = triple(cursor + 1);
            cursor += 4;
        }
        facets.push(StlFacet { normal, vertices });
        index = cursor + 2;
    }
    return facets;
}

// flight-lint: allow(f64) binary32 values widen losslessly to match JS DataView.getFloat32 before source double normal arithmetic; cast only on vertex payload write
fn read_binary_stl_facets(bytes: &Uint8Array, count: usize) -> Vec<StlFacet> {
    let triple = |offset: usize| -> [f64; 3] {
        return std::array::from_fn(|component| {
            f32::from_le_bytes(
                bytes[offset + component * 4..offset + component * 4 + 4]
                    .try_into()
                    .unwrap(),
            ) as f64
        });
    };
    let mut facets = Vec::new();
    for triangle in 0..count {
        let base = BINARY_STL_HEADER_SIZE + triangle * BINARY_STL_TRIANGLE_SIZE;
        facets.push(StlFacet {
            normal: triple(base),
            vertices: [triple(base + 12), triple(base + 24), triple(base + 36)],
        });
    }
    return facets;
}

// flight-lint: allow(f64) private stored/geometric normal selection preserves source double Number.isFinite/zero sentinel branches before canonical Float32Array writes
fn resolve_facet_normal(facet: &StlFacet, policy: StlNormalPolicy) -> [f64; 3] {
    if policy == StlNormalPolicy::RecomputeFromVertices {
        return compute_facet_normal(facet);
    }
    let stored = normalize_vector(facet.normal);
    return if stored == [0.0; 3] {
        compute_facet_normal(facet)
    } else {
        stored
    };
}

impl StlImportOptions {
    pub fn parse(&self, bytes: &Uint8Array) -> Option<MeshGeometry> {
        return parse_stl(bytes, Some(self));
    }
}
