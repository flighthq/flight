use flight_entity::{Float32Array, Float64Array, Ref, Uint8Array};
use flight_image::{
    EmbeddedImageResourceReferenceValue, ExternalImageResourceReferenceValue,
    ImageResourceReference, create_embedded_image_resource_reference,
    create_external_image_resource_reference, create_texture_from_image_resource,
};
use flight_meshgeometry::{VertexAttribute, VertexAttributeLayout, VertexFormat, VertexSemantic};
use flight_texture::Texture;
use std::sync::{Arc, LazyLock, RwLock};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SkinInfluence {
    pub joint_index: f32,
    pub weight: f32,
}

pub const CANONICAL_FLOATS_PER_VERTEX: usize = 12;
pub static CANONICAL_LAYOUT: LazyLock<Ref<VertexAttributeLayout>> = LazyLock::new(|| {
    return Arc::new(RwLock::new(VertexAttributeLayout {
        attributes: vec![
            VertexAttribute {
                byte_offset: 0,
                format: VertexFormat::Float32x3,
                semantic: VertexSemantic::Position,
            },
            VertexAttribute {
                byte_offset: 12,
                format: VertexFormat::Float32x3,
                semantic: VertexSemantic::Normal,
            },
            VertexAttribute {
                byte_offset: 24,
                format: VertexFormat::Float32x4,
                semantic: VertexSemantic::Tangent,
            },
            VertexAttribute {
                byte_offset: 40,
                format: VertexFormat::Float32x2,
                semantic: VertexSemantic::Uv0,
            },
        ],
        stride: 48,
    }));
});

pub const MAX_SKIN_INFLUENCES: usize = 4;
pub const SKINNED_FLOATS_PER_VERTEX: usize = 20;

pub fn create_embedded_texture_ref(
    bytes: Ref<Box<Uint8Array>>,
    mime_type: Option<&str>,
    resources: Option<&mut Vec<ImageResourceReference>>,
) -> Ref<Texture> {
    let existing = resources
        .as_ref()
        .and_then(|resources| {
            resources.iter().find(|candidate| {
                if let ImageResourceReference::Embedded(value) = candidate {
                    let value = value.reference.read().unwrap();
                    return Arc::ptr_eq(&value.bytes, &bytes)
                        && value.mime_type.as_deref() == mime_type;
                }
                return false;
            })
        })
        .cloned();
    let reference = if let Some(reference) = existing {
        reference
    } else {
        let embedded = create_embedded_image_resource_reference(bytes);
        embedded.write().unwrap().mime_type = mime_type.map(str::to_string);
        let reference = ImageResourceReference::Embedded(EmbeddedImageResourceReferenceValue {
            reference: embedded,
        });
        if let Some(resources) = resources {
            resources.push(reference.clone());
        }
        reference
    };
    return create_texture_from_image_resource(&reference, None);
}

pub fn create_external_texture_ref(
    uri: &str,
    base_path: Option<&str>,
    resources: Option<&mut Vec<ImageResourceReference>>,
) -> Ref<Texture> {
    let existing = resources
        .as_ref()
        .and_then(|resources| {
            resources.iter().find(|candidate| {
                if let ImageResourceReference::External(value) = candidate {
                    let value = value.reference.read().unwrap();
                    return value.uri == uri && value.base_path.as_deref() == base_path;
                }
                return false;
            })
        })
        .cloned();
    let reference = if let Some(reference) = existing {
        reference
    } else {
        let external = create_external_image_resource_reference(uri.to_string());
        external.write().unwrap().base_path = base_path.map(str::to_string);
        let reference = ImageResourceReference::External(ExternalImageResourceReferenceValue {
            reference: external,
        });
        if let Some(resources) = resources {
            resources.push(reference.clone());
        }
        reference
    };
    return create_texture_from_image_resource(&reference, None);
}

pub fn convert_positions_z_up_to_y_up(
    values: &mut [f32],
    stride: Option<usize>,
    offset: Option<usize>,
) {
    let stride = stride.unwrap_or(3);
    let mut index = offset.unwrap_or(0);
    while index + 2 < values.len() {
        let y = values[index + 1];
        values[index + 1] = values[index + 2];
        values[index + 2] = -y + 0.0;
        index += stride;
    }
}

pub fn convert_quaternions_z_up_to_y_up(
    values: &mut [f32],
    stride: Option<usize>,
    offset: Option<usize>,
) {
    let stride = stride.unwrap_or(4);
    let mut index = offset.unwrap_or(0);
    while index + 3 < values.len() {
        let y = values[index + 1];
        values[index + 1] = values[index + 2];
        values[index + 2] = -y + 0.0;
        index += stride;
    }
}

// flight-lint: allow(f64) exact source Float64Array AWD transform storage, not a numeric policy widening
pub fn convert_transform_lh_to_rh(transform: &mut Float64Array) {
    for index in [2, 5, 6, 7, 11] {
        if let Some(value) = transform.get_mut(index) {
            *value = -*value + 0.0;
        }
    }
}

pub fn negate_vec3_z(values: &mut Vec<f32>) {
    for index in (2..values.len()).step_by(3) {
        values[index] = -values[index] + 0.0;
    }
}

// flight-lint: allow(conform-params) D9 required out-first writers precede the mutable influence input; source has influences,outJoints,outWeights
pub fn pack_skin_influences(
    out_joints: &mut Vec<f32>,
    out_weights: &mut Vec<f32>,
    influences: &mut [SkinInfluence],
) {
    if out_joints.len() < MAX_SKIN_INFLUENCES {
        out_joints.resize(MAX_SKIN_INFLUENCES, 0.0);
    }
    if out_weights.len() < MAX_SKIN_INFLUENCES {
        out_weights.resize(MAX_SKIN_INFLUENCES, 0.0);
    }
    for i in 0..MAX_SKIN_INFLUENCES {
        out_joints[i] = 0.0;
        out_weights[i] = 0.0;
    }
    influences.sort_by(|a, b| {
        (b.weight - a.weight)
            .partial_cmp(&0.0)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let kept = influences.len().min(MAX_SKIN_INFLUENCES);
    let mut sum = 0.0;
    for influence in &influences[..kept] {
        sum += influence.weight;
    }
    for i in 0..kept {
        out_joints[i] = influences[i].joint_index;
        out_weights[i] = if sum > 0.0 {
            influences[i].weight / sum
        } else {
            0.0
        };
    }
}

pub fn reverse_triangle_winding(indices: &mut Vec<f32>) {
    for triangle in indices.chunks_exact_mut(3) {
        triangle.swap(1, 2);
    }
}

pub fn reverse_vertex_triangle_winding(vertices: &mut Float32Array, floats_per_vertex: i32) {
    if floats_per_vertex <= 0 {
        return;
    }
    let stride = floats_per_vertex as usize;
    for triangle in vertices.chunks_exact_mut(stride * 3) {
        for component in 0..stride {
            triangle.swap(stride + component, stride * 2 + component);
        }
    }
}
