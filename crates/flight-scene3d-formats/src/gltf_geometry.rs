use crate::gltf_accessor::{
    GltfAccessorReader, gltf_accessor_fault, gltf_integer_field, read_gltf_accessor,
};
use crate::gltf_core_shared::gltf_component_values;
use crate::gltf_diagnostics::{report_gltf_accessor_fault, tally_gltf_numbers};
use crate::gltf_draco_read::resolve_gltf_draco_mesh;
use crate::gltf_schema::GltfPrimitive;
use crate::gltf_types::*;
use crate::shared::{CANONICAL_FLOATS_PER_VERTEX, CANONICAL_LAYOUT, SKINNED_FLOATS_PER_VERTEX};
use flight_entity::{Ref, get_record_keys, get_record_value};
use flight_importdiagnostics::ImportDiagnosticSeverity;
use flight_meshgeometry::{
    CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, IndexBuffer, IndexBufferU32, MeshGeometry,
    MeshGeometryOptions, MeshMorph, MeshMorphTarget, PrimitiveTopology,
    compute_mesh_geometry_flat_normals, compute_mesh_geometry_tangents, create_mesh_geometry,
    expand_mesh_geometry_indices, index_mesh_geometry_vertices,
};
use std::sync::{Arc, RwLock};

#[cfg(test)]
#[path = "../tests/internal/gltf_geometry_test.rs"]
mod tests;

struct GltfPrimitiveElements {
    indices: Option<Box<[u32]>>,
    topology: PrimitiveTopology,
}

pub(crate) fn build_gltf_morph(
    reader: &GltfAccessorReader,
    primitive: &Ref<GltfPrimitive>,
    mesh_weights: Option<&[f32]>,
    base_vertex_count: usize,
) -> Option<Ref<MeshMorph>> {
    let source_targets = primitive.read().unwrap().targets.clone()?;
    if source_targets.is_empty() {
        return None;
    }
    let mut targets = Vec::new();
    for (target_index, target) in source_targets.iter().enumerate() {
        let (position, normal, tangent) = {
            let row = target.read().unwrap();
            (row.position, row.normal, row.tangent)
        };
        let Some(position) = position else {
            tally_gltf_numbers(
                reader.drops.as_ref(),
                ImportDiagnosticSeverity::Drop,
                "gltf.morph-target-no-position",
                &[("firstTarget", target_index as f32)],
            );
            return None;
        };
        let position_index = gltf_integer_field(&reader.metadata, target, "POSITION", position);
        let position = read_gltf_attribute(reader, None, "", position_index, position, "VEC3");
        if position.fault.is_some() {
            tally_gltf_numbers(
                reader.drops.as_ref(),
                ImportDiagnosticSeverity::Drop,
                "gltf.morph-target-no-position",
                &[("firstTarget", target_index as f32)],
            );
            return None;
        }
        if position.count != base_vertex_count {
            tally_gltf_numbers(
                reader.drops.as_ref(),
                ImportDiagnosticSeverity::Drop,
                "gltf.morph-target-count-mismatch",
                &[
                    ("firstActual", position.count as f32),
                    ("firstExpected", base_vertex_count as f32),
                    ("firstTarget", target_index as f32),
                ],
            );
            return None;
        }
        let mut position_deltas = Vec::new();
        gltf_component_values(&mut position_deltas, &position.data);
        let normal_deltas = normal
            .and_then(|number| {
                read_optional_gltf_attribute(
                    reader,
                    None,
                    "NORMAL",
                    gltf_integer_field(&reader.metadata, target, "NORMAL", number),
                    number,
                    base_vertex_count,
                    "VEC3",
                )
            })
            .map(Vec::into_boxed_slice);
        let tangent_deltas = tangent
            .and_then(|number| {
                read_optional_gltf_attribute(
                    reader,
                    None,
                    "TANGENT",
                    gltf_integer_field(&reader.metadata, target, "TANGENT", number),
                    number,
                    base_vertex_count,
                    "VEC3",
                )
            })
            .map(Vec::into_boxed_slice);
        targets.push(MeshMorphTarget {
            position_deltas: position_deltas.into_boxed_slice(),
            normal_deltas,
            tangent_deltas,
        });
    }
    let mut weights = vec![0.0; targets.len()];
    if let Some(source) = mesh_weights {
        for (weight, value) in weights.iter_mut().zip(source) {
            *weight = *value;
        }
    }
    return Some(Arc::new(RwLock::new(MeshMorph {
        targets: Arc::new(targets),
        weights: weights.into_boxed_slice(),
    })));
}

fn build_gltf_primitive_elements(
    reader: &GltfAccessorReader,
    primitive: &Ref<GltfPrimitive>,
    source: Option<Box<[u32]>>,
    vertex_count: usize,
) -> Option<GltfPrimitiveElements> {
    let mode = {
        let row = primitive.read().unwrap();
        gltf_integer_field(&reader.metadata, primitive, "mode", row.mode.unwrap_or(4.0))
    };
    let topology = match mode {
        Some(0) => PrimitiveTopology::PointList,
        Some(1 | 2) => PrimitiveTopology::LineList,
        Some(3) => PrimitiveTopology::LineStrip,
        Some(4 | 6) => PrimitiveTopology::TriangleList,
        Some(5) => PrimitiveTopology::TriangleStrip,
        _ => {
            tally_gltf_numbers(
                reader.drops.as_ref(),
                ImportDiagnosticSeverity::Drop,
                "gltf.primitive-unsupported-mode",
                &[("firstMode", primitive.read().unwrap().mode.unwrap_or(4.0))],
            );
            return None;
        }
    };
    let indices = if mode == Some(2) || mode == Some(6) {
        let count = source
            .as_ref()
            .map(|values| values.len())
            .unwrap_or(vertex_count);
        let index = |position: usize| {
            source
                .as_ref()
                .map(|values| values[position])
                .unwrap_or(position as u32)
        };
        let mut indices = Vec::new();
        if mode == Some(2) && count >= 2 {
            for i in 0..count {
                indices.push(index(i));
                indices.push(index((i + 1) % count));
            }
        } else if mode == Some(6) && count >= 3 {
            for i in 1..count - 1 {
                indices.push(index(0));
                indices.push(index(i));
                indices.push(index(i + 1));
            }
        }
        Some(indices.into_boxed_slice())
    } else {
        source
    };
    return Some(GltfPrimitiveElements { indices, topology });
}

fn complete_gltf_shading(
    reader: &GltfAccessorReader,
    primitive: &Ref<GltfPrimitive>,
    mut geometry: MeshGeometry,
    has_normals: bool,
    has_tangents: bool,
    has_uvs: bool,
) -> MeshGeometry {
    if !matches!(
        geometry.topology,
        PrimitiveTopology::TriangleList | PrimitiveTopology::TriangleStrip
    ) {
        return geometry;
    }
    if !has_normals {
        if primitive
            .read()
            .unwrap()
            .targets
            .as_ref()
            .is_none_or(Vec::is_empty)
        {
            geometry = index_mesh_geometry_vertices(&expand_mesh_geometry_indices(&geometry));
        }
        let source = gltf_shading_source(&geometry);
        compute_mesh_geometry_flat_normals(&mut geometry, &source);
    }
    if !has_tangents && has_uvs && reads_gltf_tangent_space(reader, primitive) {
        let source = gltf_shading_source(&geometry);
        compute_mesh_geometry_tangents(&mut geometry, &source, None);
    }
    return geometry;
}

fn gltf_component_indices(out: &mut Vec<u32>, data: &GltfComponentArray) {
    out.clear();
    match data {
        GltfComponentArray::Float32(values) => out.extend(
            values
                .values
                .read()
                .unwrap()
                .iter()
                .map(|value| gltf_float_uint32(*value)),
        ),
        GltfComponentArray::Int8(values) => out.extend(
            values
                .values
                .read()
                .unwrap()
                .iter()
                .map(|value| *value as u32),
        ),
        GltfComponentArray::Int16(values) => out.extend(
            values
                .values
                .read()
                .unwrap()
                .iter()
                .map(|value| *value as u32),
        ),
        GltfComponentArray::Uint8(values) => out.extend(
            values
                .values
                .read()
                .unwrap()
                .iter()
                .map(|value| *value as u32),
        ),
        GltfComponentArray::Uint16(values) => out.extend(
            values
                .values
                .read()
                .unwrap()
                .iter()
                .map(|value| *value as u32),
        ),
        GltfComponentArray::Uint32(values) => {
            out.extend(values.values.read().unwrap().iter().copied())
        }
    }
}

fn gltf_float_uint32(value: f32) -> u32 {
    if !value.is_finite() || value == 0.0 {
        return 0;
    }
    let magnitude = (value.abs().trunc() % 4294967296.0) as u32;
    return if value < 0.0 {
        magnitude.wrapping_neg()
    } else {
        magnitude
    };
}

fn gltf_shading_source(geometry: &MeshGeometry) -> MeshGeometry {
    // Native borrow separation snapshots only authored numeric storage and shared layout/index handles.
    // The canonical constructor allocates a fresh runtime; the source Entity runtime is never cloned.
    return create_mesh_geometry(MeshGeometryOptions {
        vertices: geometry.vertices.clone(),
        layout: geometry.layout.clone(),
        indices: Some(geometry.indices.clone()),
        subsets: Some(geometry.subsets.clone()),
        topology: Some(geometry.topology),
    });
}

pub(crate) fn primitive_gltf_to_geometry(
    reader: &GltfAccessorReader,
    primitive: &Ref<GltfPrimitive>,
    options: Option<&GltfImportOptions>,
) -> Option<Ref<MeshGeometry>> {
    let draco = resolve_gltf_draco_mesh(reader, primitive, options);
    let attributes = primitive.read().unwrap().attributes.clone();
    let position_number = attributes.read().unwrap().position;
    let Some(position_number) = position_number else {
        tally_gltf_numbers(
            reader.drops.as_ref(),
            ImportDiagnosticSeverity::Drop,
            "gltf.primitive-no-position",
            &[],
        );
        return None;
    };
    let position_index =
        gltf_integer_field(&reader.metadata, &attributes, "POSITION", position_number);
    let position = read_gltf_attribute(
        reader,
        draco.as_ref(),
        "POSITION",
        position_index,
        position_number,
        "VEC3",
    );
    if position.count == 0 {
        tally_gltf_numbers(
            reader.drops.as_ref(),
            ImportDiagnosticSeverity::Drop,
            "gltf.primitive-no-position",
            &[("firstAccessor", position_number)],
        );
        return None;
    }
    let vertex_count = position.count;
    let mut positions = Vec::new();
    gltf_component_values(&mut positions, &position.data);
    let mut channels = Vec::new();
    for (semantic, field, width) in [
        ("NORMAL", "NORMAL", "VEC3"),
        ("TANGENT", "TANGENT", "VEC4"),
        ("TEXCOORD_0", "TEXCOORD_0", "VEC2"),
        ("JOINTS_0", "JOINTS_0", "VEC4"),
        ("WEIGHTS_0", "WEIGHTS_0", "VEC4"),
    ] {
        let number = {
            let row = attributes.read().unwrap();
            match semantic {
                "NORMAL" => row.normal,
                "TANGENT" => row.tangent,
                "TEXCOORD_0" => row.texcoord_0,
                "JOINTS_0" => row.joints_0,
                _ => row.weights_0,
            }
        };
        let channel = number.and_then(|number| {
            let index = gltf_integer_field(&reader.metadata, &attributes, field, number);
            return read_optional_gltf_attribute(
                reader,
                draco.as_ref(),
                semantic,
                index,
                number,
                vertex_count,
                width,
            );
        });
        channels.push(channel);
    }
    let skinned = channels[3].is_some() && channels[4].is_some();
    let stride = if skinned {
        SKINNED_FLOATS_PER_VERTEX
    } else {
        CANONICAL_FLOATS_PER_VERTEX
    };
    let mut vertices = vec![0.0; vertex_count * stride];
    let component = |values: &[f32], index: usize| values.get(index).copied().unwrap_or(f32::NAN);
    for vertex in 0..vertex_count {
        let offset = vertex * stride;
        for c in 0..3 {
            vertices[offset + c] = component(&positions, vertex * 3 + c);
        }
        for (channel, width, slot) in [(0, 3, 3), (1, 4, 6), (2, 2, 10)] {
            if let Some(values) = &channels[channel] {
                for c in 0..width {
                    vertices[offset + slot + c] = component(values, vertex * width + c);
                }
            }
        }
        if skinned {
            let joints = channels[3].as_ref().unwrap();
            let weights = channels[4].as_ref().unwrap();
            for c in 0..4 {
                vertices[offset + 12 + c] = component(joints, vertex * 4 + c);
            }
            let w0 = component(weights, vertex * 4);
            let w1 = component(weights, vertex * 4 + 1);
            let w2 = component(weights, vertex * 4 + 2);
            let w3 = component(weights, vertex * 4 + 3);
            let sum = w0 + w1 + w2 + w3;
            let inverse = if sum > 0.0 { 1.0 / sum } else { 0.0 };
            for (c, weight) in [w0, w1, w2, w3].into_iter().enumerate() {
                vertices[offset + 16 + c] = weight * inverse;
            }
        }
    }
    let decoded_indices = draco
        .as_ref()
        .and_then(|draco| draco.read().unwrap().indices.clone());
    let source_indices = if let Some(indices) = decoded_indices {
        Some(indices.read().unwrap().to_vec().into_boxed_slice())
    } else {
        let number = primitive.read().unwrap().indices;
        if let Some(number) = number {
            let index = gltf_integer_field(&reader.metadata, primitive, "indices", number);
            let result = read_gltf_attribute(reader, None, "", index, number, "SCALAR");
            if let Some(fault) = result.fault {
                report_gltf_accessor_fault(
                    reader.drops.as_ref(),
                    ImportDiagnosticSeverity::Drop,
                    &fault,
                );
                return None;
            }
            if result.count == 0 {
                tally_gltf_numbers(
                    reader.drops.as_ref(),
                    ImportDiagnosticSeverity::Drop,
                    "gltf.primitive-empty-indices",
                    &[("firstAccessor", number)],
                );
                return None;
            }
            let mut values = Vec::new();
            gltf_component_indices(&mut values, &result.data);
            Some(values.into_boxed_slice())
        } else {
            None
        }
    };
    let elements = build_gltf_primitive_elements(reader, primitive, source_indices, vertex_count)?;
    let geometry = create_mesh_geometry(MeshGeometryOptions {
        vertices: vertices.into_boxed_slice(),
        layout: if skinned {
            CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT.clone()
        } else {
            CANONICAL_LAYOUT.clone()
        },
        indices: elements.indices.map(|data| {
            IndexBuffer::U32(IndexBufferU32 {
                data: Arc::new(RwLock::new(data)),
            })
        }),
        subsets: None,
        topology: Some(elements.topology),
    });
    return Some(Arc::new(RwLock::new(complete_gltf_shading(
        reader,
        primitive,
        geometry,
        channels[0].is_some(),
        channels[1].is_some(),
        channels[2].is_some(),
    ))));
}

fn read_gltf_attribute(
    reader: &GltfAccessorReader,
    draco: Option<&Ref<GltfDracoMesh>>,
    semantic: &str,
    index: Option<usize>,
    number: f32,
    expected_type: &str,
) -> GltfAccessorData {
    if let Some(draco) = draco {
        let (attributes, count) = {
            let draco = draco.read().unwrap();
            (draco.attributes.clone(), draco.vertex_count)
        };
        if let Some(values) = get_record_value(&attributes.read().unwrap(), semantic).cloned() {
            return GltfAccessorData {
                count,
                data: GltfComponentArray::Float32(GltfFloat32Array { values }),
                fault: None,
            };
        }
    }
    return if let Some(index) = index {
        read_gltf_accessor(reader, index, Some(expected_type))
    } else {
        gltf_accessor_fault("gltf.accessor-not-found", &[("firstAccessor", number)])
    };
}

fn read_optional_gltf_attribute(
    reader: &GltfAccessorReader,
    draco: Option<&Ref<GltfDracoMesh>>,
    semantic: &str,
    index: Option<usize>,
    number: f32,
    count: usize,
    expected_type: &str,
) -> Option<Vec<f32>> {
    let result = read_gltf_attribute(reader, draco, semantic, index, number, expected_type);
    if let Some(fault) = result.fault {
        report_gltf_accessor_fault(
            reader.drops.as_ref(),
            ImportDiagnosticSeverity::Recover,
            &fault,
        );
        return None;
    }
    if result.count != count {
        tally_gltf_numbers(
            reader.drops.as_ref(),
            ImportDiagnosticSeverity::Recover,
            "gltf.accessor-count-mismatch",
            &[
                ("firstAccessor", number),
                ("firstActual", result.count as f32),
                ("firstExpected", count as f32),
            ],
        );
        return None;
    }
    let mut values = Vec::new();
    gltf_component_values(&mut values, &result.data);
    return Some(values);
}

fn reads_gltf_tangent_space(reader: &GltfAccessorReader, primitive: &Ref<GltfPrimitive>) -> bool {
    let index = {
        let row = primitive.read().unwrap();
        row.material
            .and_then(|value| gltf_integer_field(&reader.metadata, primitive, "material", value))
    };
    let material = reader
        .source
        .read()
        .unwrap()
        .materials
        .as_ref()
        .and_then(|rows| index.and_then(|index| rows.get(index)))
        .cloned();
    let Some(material) = material else {
        return false;
    };
    let material = material.read().unwrap();
    if material.normal_texture.is_some() {
        return true;
    }
    let Some(extensions) = &material.extensions else {
        return false;
    };
    let extensions = extensions.read().unwrap();
    let mut keys = Vec::new();
    get_record_keys(&mut keys, &extensions.vendor);
    return !keys.is_empty()
        || extensions.khr_materials_anisotropy.is_some()
        || extensions.khr_materials_clearcoat.is_some()
        || extensions.khr_materials_emissive_strength.is_some()
        || extensions.khr_materials_ior.is_some()
        || extensions.khr_materials_iridescence.is_some()
        || extensions.khr_materials_pbr_specular_glossiness.is_some()
        || extensions.khr_materials_sheen.is_some()
        || extensions.khr_materials_specular.is_some()
        || extensions.khr_materials_transmission.is_some()
        || extensions.khr_materials_unlit.is_some()
        || extensions.khr_materials_volume.is_some();
}
