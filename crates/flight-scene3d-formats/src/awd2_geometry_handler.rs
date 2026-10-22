use crate::awd2_parse::report_awd_diagnostic;
use crate::awd2_reader::{
    awd_data_type_byte_size, read_awd_data_value, read_awd_string, skip_awd_attr_list,
};
use crate::awd2_schema::*;
use crate::awd2_types::{Awd2Block, Awd2BlockHandler, Awd2GeometryEntry, Awd2ParsedGeometry};
use crate::shared::{
    CANONICAL_FLOATS_PER_VERTEX, CANONICAL_LAYOUT, SKINNED_FLOATS_PER_VERTEX, SkinInfluence,
    negate_vec3_z, pack_skin_influences, reverse_vertex_triangle_winding,
};
use crate::three_ds_read::{read_three_ds_u16, read_three_ds_u32};
use flight_entity::{Ref, Uint8Array};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_meshgeometry::{
    CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, IndexBuffer, IndexBufferU32, MeshGeometryOptions,
    clone_mesh_geometry, compute_mesh_geometry_normals, compute_mesh_geometry_tangents,
    create_mesh_geometry,
};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

pub static AWD2_TRIANGLE_GEOMETRY_HANDLER: LazyLock<Ref<Awd2BlockHandler>> = LazyLock::new(|| {
    Arc::new(RwLock::new(Awd2BlockHandler {
        block_types: vec![AWD2_BLOCK_TRIANGLE_GEOMETRY],
        build_phase: None,
        deferred: None,
        parse: Arc::new(|state, block| {
            let geometries = parse_triangle_geometry_block(block, state.diagnostics.as_ref());
            if let Some(entry) = state
                .geometries
                .iter_mut()
                .find(|entry| entry.key == block.block_id)
            {
                entry.value = geometries;
            } else {
                state.geometries.push(Awd2GeometryEntry {
                    key: block.block_id,
                    value: geometries,
                });
            }
        }),
        build: None,
    }))
});

const AWD2_TANGENT_HANDEDNESS: f32 = -1.0;

fn geometry_diagnostic(
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
    severity: ImportDiagnosticSeverity,
    kind: &str,
    detail: Option<HashMap<String, ImportDiagnosticDetailValue>>,
) {
    report_awd_diagnostic(
        diagnostics,
        severity,
        kind,
        "parseTriangleGeometryBlock",
        detail,
    );
}

fn parse_triangle_geometry_block(
    block: &Awd2Block,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) -> Vec<Awd2ParsedGeometry> {
    let view = block.view.read().unwrap();
    let mut offset = block.data_start;
    let end = block.data_end;
    if offset + 2 > end || offset + 2 + read_three_ds_u16(&view, offset) as usize > end {
        geometry_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Drop,
            "awd2.geometry-truncated",
            Some(HashMap::from([(
                "field".to_string(),
                ImportDiagnosticDetailValue::String("name".to_string()),
            )])),
        );
        return Vec::new();
    }
    offset = if Arc::ptr_eq(&block.source, &block.view) {
        read_awd_string(&view, &view, offset).end
    } else {
        read_awd_string(&view, &block.source.read().unwrap(), offset).end
    };
    if offset + 2 > end {
        geometry_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Drop,
            "awd2.geometry-truncated",
            Some(HashMap::from([(
                "field".to_string(),
                ImportDiagnosticDetailValue::String("num-submeshes".to_string()),
            )])),
        );
        return Vec::new();
    }
    let sub_mesh_count = read_three_ds_u16(&view, offset) as usize;
    offset = skip_awd_attr_list(&view, offset + 2, end);
    let mut geometries = Vec::new();
    for sub_mesh in 0..sub_mesh_count {
        if offset + 4 > end {
            geometry_diagnostic(
                diagnostics,
                ImportDiagnosticSeverity::Drop,
                "awd2.submesh-truncated",
                Some(HashMap::from([(
                    "firstSubMesh".to_string(),
                    ImportDiagnosticDetailValue::Number(sub_mesh as f32),
                )])),
            );
            break;
        }
        let sub_mesh_end = offset + 4 + read_three_ds_u32(&view, offset) as usize;
        offset = skip_awd_attr_list(&view, offset + 4, end);
        let mut positions = None;
        let mut indices = None;
        let mut uvs = None;
        let mut normals = None;
        let mut tangents = None;
        let mut joint_indices = None;
        let mut joint_weights = None;
        while offset + 6 <= sub_mesh_end {
            let stream_type = read_awd_data_value(&view, offset, AWD2_DATA_UINT8) as u8;
            let data_type = read_awd_data_value(&view, offset + 1, AWD2_DATA_UINT8) as u8;
            let length = read_three_ds_u32(&view, offset + 2) as usize;
            offset += 6;
            if offset + length > end {
                geometry_diagnostic(
                    diagnostics,
                    ImportDiagnosticSeverity::Recover,
                    "awd2.stream-data-past-end",
                    None,
                );
                break;
            }
            if stream_type == AWD2_STREAM_JOINT_INDICES {
                joint_indices = Some(
                    (0..length / 2)
                        .map(|i| read_three_ds_u16(&view, offset + i * 2) as f32)
                        .collect::<Vec<_>>(),
                );
            } else {
                let size = awd_data_type_byte_size(data_type);
                if stream_type == AWD2_STREAM_INDICES {
                    indices = Some(
                        (0..length / size)
                            .map(|i| read_awd_geometry_index(&view, offset + i * size, data_type))
                            .collect::<Vec<_>>(),
                    );
                } else {
                    let values = (0..length / size)
                        .map(|i| read_awd_data_value(&view, offset + i * size, data_type))
                        .collect::<Vec<_>>();
                    match stream_type {
                        AWD2_STREAM_POSITIONS => positions = Some(values),
                        AWD2_STREAM_UVS => uvs = Some(values),
                        AWD2_STREAM_NORMALS => normals = Some(values),
                        AWD2_STREAM_TANGENTS => tangents = Some(values),
                        AWD2_STREAM_JOINT_WEIGHTS => joint_weights = Some(values),
                        _ => {}
                    }
                }
            }
            offset += length;
        }
        offset = skip_awd_attr_list(&view, offset, end);
        let Some(mut positions) = positions.filter(|positions| positions.len() >= 3) else {
            geometry_diagnostic(
                diagnostics,
                ImportDiagnosticSeverity::Drop,
                "awd2.submesh-no-positions",
                None,
            );
            continue;
        };
        negate_vec3_z(&mut positions);
        if let Some(normals) = normals.as_mut() {
            negate_vec3_z(normals);
        }
        if let Some(tangents) = tangents.as_mut() {
            negate_vec3_z(tangents);
        }
        if let Some(indices) = indices.as_mut() {
            for triangle in indices.chunks_exact_mut(3) {
                triangle.swap(1, 2);
            }
        }
        let mut joints_per_vertex = 0;
        if let (Some(joints), Some(weights)) = (&joint_indices, &joint_weights) {
            joints_per_vertex = weights.len() * 3 / positions.len();
            if joints_per_vertex < 1 || joints.len() * 3 < positions.len() * joints_per_vertex {
                geometry_diagnostic(
                    diagnostics,
                    ImportDiagnosticSeverity::Recover,
                    "awd2.skin-streams-mismatch",
                    None,
                );
                joints_per_vertex = 0;
            }
        }
        let skinned = joints_per_vertex > 0;
        let stride = if skinned {
            SKINNED_FLOATS_PER_VERTEX
        } else {
            CANONICAL_FLOATS_PER_VERTEX
        };
        let mut vertices = vec![0.0; positions.len() * stride / 3];
        let mut joint_scratch = vec![0.0; 4];
        let mut weight_scratch = vec![0.0; 4];
        for vertex in 0..positions.len().div_ceil(3) {
            let mut record = [0.0; SKINNED_FLOATS_PER_VERTEX];
            for component in 0..3 {
                record[component] = positions
                    .get(vertex * 3 + component)
                    .copied()
                    .unwrap_or(f32::NAN);
            }
            if let Some(normals) = normals
                .as_ref()
                .filter(|values| vertex * 3 + 2 < values.len())
            {
                record[3..6].copy_from_slice(&normals[vertex * 3..vertex * 3 + 3]);
            }
            if let Some(tangents) = tangents
                .as_ref()
                .filter(|values| vertex * 3 + 2 < values.len())
            {
                record[6..9].copy_from_slice(&tangents[vertex * 3..vertex * 3 + 3]);
                record[9] = AWD2_TANGENT_HANDEDNESS;
            }
            if let Some(uvs) = uvs.as_ref().filter(|values| vertex * 2 + 1 < values.len()) {
                record[10..12].copy_from_slice(&uvs[vertex * 2..vertex * 2 + 2]);
            }
            if skinned {
                let mut influences = Vec::new();
                for influence in 0..joints_per_vertex {
                    let index = vertex * joints_per_vertex + influence;
                    let weight = joint_weights
                        .as_ref()
                        .unwrap()
                        .get(index)
                        .copied()
                        .unwrap_or(f32::NAN);
                    if weight > 0.0 {
                        influences.push(SkinInfluence {
                            joint_index: joint_indices
                                .as_ref()
                                .unwrap()
                                .get(index)
                                .copied()
                                .unwrap_or(f32::NAN),
                            weight,
                        });
                    }
                }
                pack_skin_influences(&mut joint_scratch, &mut weight_scratch, &mut influences);
                record[12..16].copy_from_slice(&joint_scratch);
                record[16..20].copy_from_slice(&weight_scratch);
            }
            for (component, value) in record[..stride].iter().enumerate() {
                if let Some(destination) = vertices.get_mut(vertex * stride + component) {
                    *destination = *value;
                }
            }
        }
        if indices.is_none() {
            reverse_vertex_triangle_winding(&mut vertices, stride as i32);
        }
        let mut geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: indices.map(|values| {
                IndexBuffer::U32(IndexBufferU32 {
                    data: Arc::new(RwLock::new(values.into_boxed_slice())),
                })
            }),
            layout: if skinned {
                CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT.clone()
            } else {
                CANONICAL_LAYOUT.clone()
            },
            vertices: vertices.into_boxed_slice(),
            subsets: None,
            topology: None,
        });
        if normals.is_none() {
            let source = clone_mesh_geometry(&geometry);
            compute_mesh_geometry_normals(&mut geometry, &source, None);
        }
        if tangents.is_none() && uvs.is_some() {
            let source = clone_mesh_geometry(&geometry);
            compute_mesh_geometry_tangents(&mut geometry, &source, None);
        }
        geometries.push(Awd2ParsedGeometry {
            geometry: Arc::new(RwLock::new(geometry)),
            skinned,
        });
    }
    return geometries;
}

fn read_awd_geometry_index(view: &Uint8Array, offset: usize, data_type: u8) -> u32 {
    // Uint32Array.from applies integer truncation/modulo after decoding. Keep wire integers exact,
    // including values above the f32 exact-integer range, rather than routing through a scalar f32.
    match data_type {
        AWD2_DATA_UINT32 => return read_three_ds_u32(view, offset),
        AWD2_DATA_INT32 => return read_three_ds_u32(view, offset),
        AWD2_DATA_FLOAT64 => {
            // Project the decoded IEEE-754 wire value to uint32 directly, without an early f32 cast.
            let low = read_three_ds_u32(view, offset);
            let high = read_three_ds_u32(view, offset + 4);
            let exponent = ((high >> 20) & 0x7ff) as i32 - 1023;
            if exponent < 0 || exponent >= 84 {
                return 0;
            }
            let significand = (1u64 << 52) | (((high & 0xfffff) as u64) << 32) | low as u64;
            let integer = if exponent < 52 {
                (significand >> (52 - exponent)) as u32
            } else {
                (significand as u32).wrapping_shl((exponent - 52) as u32)
            };
            return if high >> 31 == 0 {
                integer
            } else {
                integer.wrapping_neg()
            };
        }
        _ => {}
    }
    let value = read_awd_data_value(view, offset, data_type);
    if !value.is_finite() || value.abs() >= 9223372036854775808.0 {
        return 0;
    }
    return value.trunc() as i64 as u32;
}
