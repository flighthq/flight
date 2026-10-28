use crate::awd2_parse::report_awd_diagnostic;
use crate::awd2_reader::{
    awd_transform_to_transform3d, read_awd_string, read_awd_transform, skip_awd_attr_list,
};
use crate::awd2_schema::*;
use crate::awd2_types::{
    Awd2Block, Awd2BlockHandler, Awd2ContainerEntry, Awd2MeshInstanceEntry, Awd2NodeIndexEntry,
    Awd2ParseState, Awd2ParsedContainer, Awd2ParsedMeshInstance,
};
use crate::three_ds_read::{read_three_ds_u16, read_three_ds_u32};
use flight_entity::{Ref, Uint8Array};
use flight_geometry::contract::create_transform3d;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_scene3d::{MESH_KIND, NODE3D_KIND, Scene3DDocumentMesh, Scene3DDocumentNode};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

struct AwdSceneHeaderRead {
    container: Awd2ParsedContainer,
    end: usize,
}

pub static AWD2_CONTAINER_HANDLER: LazyLock<Ref<Awd2BlockHandler>> = LazyLock::new(|| {
    Arc::new(RwLock::new(Awd2BlockHandler {
        block_types: vec![AWD2_BLOCK_CONTAINER],
        build_phase: Some(AWD2_BUILD_PHASE_SCENE_STRUCTURE as f32),
        deferred: None,
        parse: Arc::new(|state, block| {
            if let Some(container) = parse_container_block(block, state.diagnostics.as_ref()) {
                if let Some(entry) = state
                    .containers
                    .iter_mut()
                    .find(|entry| entry.key == block.block_id)
                {
                    entry.value = container;
                } else {
                    state.containers.push(Awd2ContainerEntry {
                        key: block.block_id,
                        value: container,
                    });
                }
            }
        }),
        build: Some(Arc::new(|state| {
            let mut document = state.document.write().unwrap();
            for entry in &state.containers {
                let node_index = document.nodes.len() as i32;
                let mut transform = create_transform3d();
                awd_transform_to_transform3d(&mut transform, &entry.value.transform);
                document.nodes.push(Scene3DDocumentNode {
                    children: Vec::new(),
                    kind: NODE3D_KIND.to_string(),
                    mesh: None,
                    name: (!entry.value.name.is_empty()).then(|| entry.value.name.clone()),
                    transform,
                });
                set_awd_node_index(&mut state.node_index_for_block, entry.key, node_index);
            }
        })),
    }))
});

pub static AWD2_MESH_INSTANCE_HANDLER: LazyLock<Ref<Awd2BlockHandler>> = LazyLock::new(|| {
    Arc::new(RwLock::new(Awd2BlockHandler {
        block_types: vec![AWD2_BLOCK_MESH_INSTANCE],
        build_phase: Some(AWD2_BUILD_PHASE_SCENE_STRUCTURE as f32),
        deferred: None,
        parse: Arc::new(|state, block| {
            if let Some(instance) = parse_mesh_instance_block(block, state.diagnostics.as_ref()) {
                if let Some(entry) = state
                    .mesh_instances
                    .iter_mut()
                    .find(|entry| entry.key == block.block_id)
                {
                    entry.value = instance;
                } else {
                    state.mesh_instances.push(Awd2MeshInstanceEntry {
                        key: block.block_id,
                        value: instance,
                    });
                }
            }
        }),
        build: Some(Arc::new(|state| {
            build_awd_mesh_instance_nodes(state);
            parent_awd_scene_nodes(state);
        })),
    }))
});

fn build_awd_mesh_instance_nodes(state: &mut Awd2ParseState) {
    for entry in &state.mesh_instances {
        let instance = &entry.value;
        let geometries = state
            .geometries
            .iter()
            .find(|row| row.key == instance.geometry_id)
            .map(|row| &row.value);
        let mut transform = create_transform3d();
        awd_transform_to_transform3d(&mut transform, &instance.transform);
        let name = (!instance.name.is_empty()).then(|| instance.name.clone());
        let node_index;
        if let Some(geometries) = geometries.filter(|geometries| !geometries.is_empty()) {
            if geometries.len() == 1 {
                let mesh_index = state.document.read().unwrap().meshes.len() as i32;
                let materials = materials_for_awd_subset(state, &instance.material_ids, 0);
                let mut document = state.document.write().unwrap();
                document.meshes.push(Scene3DDocumentMesh {
                    geometry: geometries[0].geometry.clone(),
                    materials,
                    morph: None,
                    name: None,
                    skin: state.skin_index.filter(|_| geometries[0].skinned),
                });
                node_index = document.nodes.len() as i32;
                document.nodes.push(Scene3DDocumentNode {
                    children: Vec::new(),
                    kind: MESH_KIND.to_string(),
                    mesh: Some(mesh_index),
                    name,
                    transform,
                });
            } else {
                {
                    let mut document = state.document.write().unwrap();
                    node_index = document.nodes.len() as i32;
                    document.nodes.push(Scene3DDocumentNode {
                        children: Vec::new(),
                        kind: NODE3D_KIND.to_string(),
                        mesh: None,
                        name,
                        transform,
                    });
                }
                for (index, geometry) in geometries.iter().enumerate() {
                    let mesh_index = state.document.read().unwrap().meshes.len() as i32;
                    let materials = materials_for_awd_subset(state, &instance.material_ids, index);
                    let mut document = state.document.write().unwrap();
                    document.meshes.push(Scene3DDocumentMesh {
                        geometry: geometry.geometry.clone(),
                        materials,
                        morph: None,
                        name: None,
                        skin: state.skin_index.filter(|_| geometry.skinned),
                    });
                    let child_index = document.nodes.len() as i32;
                    document.nodes.push(Scene3DDocumentNode {
                        children: Vec::new(),
                        kind: MESH_KIND.to_string(),
                        mesh: Some(mesh_index),
                        name: None,
                        transform: create_transform3d(),
                    });
                    document.nodes[node_index as usize]
                        .children
                        .push(child_index);
                }
            }
        } else {
            {
                let mut document = state.document.write().unwrap();
                node_index = document.nodes.len() as i32;
                document.nodes.push(Scene3DDocumentNode {
                    children: Vec::new(),
                    kind: NODE3D_KIND.to_string(),
                    mesh: None,
                    name,
                    transform,
                });
            }
            if instance.geometry_id != 0 {
                report_awd_diagnostic(
                    state.diagnostics.as_ref(),
                    ImportDiagnosticSeverity::Recover,
                    "awd2.mesh-instance-missing-geometry",
                    "parseAwd2",
                    Some(HashMap::from([
                        (
                            "block".to_string(),
                            ImportDiagnosticDetailValue::Number(entry.key as f32),
                        ),
                        (
                            "geometry".to_string(),
                            ImportDiagnosticDetailValue::Number(instance.geometry_id as f32),
                        ),
                    ])),
                );
            }
        }
        set_awd_node_index(&mut state.node_index_for_block, entry.key, node_index);
    }
}

fn materials_for_awd_subset(
    state: &Awd2ParseState,
    material_ids: &[u32],
    subset_index: usize,
) -> Vec<i32> {
    let Some(resolve) = &state.resolve_material else {
        return Vec::new();
    };
    let material_id = material_ids.get(subset_index).copied().unwrap_or(0);
    let index = resolve(material_id);
    return if index >= 0 { vec![index] } else { Vec::new() };
}

fn parent_awd_node(state: &Awd2ParseState, parented: &mut Vec<u32>, block_id: u32, parent_id: u32) {
    if parent_id == 0 {
        return;
    }
    let Some(parent) = state
        .node_index_for_block
        .iter()
        .find(|row| row.key == parent_id)
    else {
        return;
    };
    let child = state
        .node_index_for_block
        .iter()
        .find(|row| row.key == block_id)
        .unwrap()
        .value;
    state.document.write().unwrap().nodes[parent.value as usize]
        .children
        .push(child);
    if !parented.contains(&block_id) {
        parented.push(block_id);
    }
}

fn parent_awd_scene_nodes(state: &Awd2ParseState) {
    let mut parented = Vec::new();
    for entry in &state.containers {
        parent_awd_node(state, &mut parented, entry.key, entry.value.parent_id);
    }
    for entry in &state.mesh_instances {
        parent_awd_node(state, &mut parented, entry.key, entry.value.parent_id);
    }
    let mut document = state.document.write().unwrap();
    for entry in &state.node_index_for_block {
        if !parented.contains(&entry.key) {
            document.scenes[0].root_nodes.push(entry.value);
        }
    }
}

fn parse_awd_scene_header(
    view: &Uint8Array,
    source: &Uint8Array,
    block: &Awd2Block,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
    kind: &str,
    origin: &str,
) -> Option<AwdSceneHeaderRead> {
    let mut offset = block.data_start;
    if offset + 4 > block.data_end {
        scene_structure_truncated(diagnostics, kind, origin, "parentId");
        return None;
    }
    let parent_id = read_three_ds_u32(view, offset);
    offset += 4;
    let float_size = if block.matrix_wide { 8 } else { 4 };
    if offset + 12 * float_size > block.data_end {
        scene_structure_truncated(diagnostics, kind, origin, "transform");
        return None;
    }
    let transform = read_awd_transform(view, offset, block.matrix_wide);
    offset = transform.end;
    if offset + 2 > block.data_end {
        scene_structure_truncated(diagnostics, kind, origin, "name");
        return None;
    }
    let name = read_awd_string(view, source, offset);
    return Some(AwdSceneHeaderRead {
        container: Awd2ParsedContainer {
            name: name.value,
            parent_id,
            transform: transform.transform,
        },
        end: name.end,
    });
}

fn parse_container_block(
    block: &Awd2Block,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) -> Option<Awd2ParsedContainer> {
    let parse = |view: &Uint8Array, source: &Uint8Array| {
        let header = parse_awd_scene_header(
            view,
            source,
            block,
            diagnostics,
            "awd2.container-truncated",
            "parseContainerBlock",
        )?;
        let offset = skip_awd_attr_list(view, header.end, block.data_end);
        skip_awd_attr_list(view, offset, block.data_end);
        return Some(header.container);
    };
    if Arc::ptr_eq(&block.source, &block.view) {
        let bytes = block.view.read().unwrap();
        return parse(&bytes, &bytes);
    }
    let view = block.view.read().unwrap();
    let source = block.source.read().unwrap();
    return parse(&view, &source);
}

fn parse_mesh_instance_block(
    block: &Awd2Block,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) -> Option<Awd2ParsedMeshInstance> {
    let parse = |view: &Uint8Array, source: &Uint8Array| {
        let header = parse_awd_scene_header(
            view,
            source,
            block,
            diagnostics,
            "awd2.mesh-instance-truncated",
            "parseMeshInstanceBlock",
        )?;
        let mut offset = header.end;
        if offset + 4 > block.data_end {
            scene_structure_truncated(
                diagnostics,
                "awd2.mesh-instance-truncated",
                "parseMeshInstanceBlock",
                "geometryId",
            );
            return None;
        }
        let geometry_id = read_three_ds_u32(view, offset);
        offset += 4;
        let mut material_ids = Vec::new();
        if offset + 2 <= block.data_end {
            let count = read_three_ds_u16(view, offset) as usize;
            offset += 2;
            for _ in 0..count {
                if offset + 4 > block.data_end {
                    break;
                }
                material_ids.push(read_three_ds_u32(view, offset));
                offset += 4;
            }
        }
        offset = skip_awd_attr_list(view, offset, block.data_end);
        skip_awd_attr_list(view, offset, block.data_end);
        return Some(Awd2ParsedMeshInstance {
            geometry_id,
            material_ids,
            name: header.container.name,
            parent_id: header.container.parent_id,
            transform: header.container.transform,
        });
    };
    if Arc::ptr_eq(&block.source, &block.view) {
        let bytes = block.view.read().unwrap();
        return parse(&bytes, &bytes);
    }
    let view = block.view.read().unwrap();
    let source = block.source.read().unwrap();
    return parse(&view, &source);
}

fn scene_structure_truncated(
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
    kind: &str,
    origin: &str,
    field: &str,
) {
    report_awd_diagnostic(
        diagnostics,
        ImportDiagnosticSeverity::Drop,
        kind,
        origin,
        Some(HashMap::from([(
            "field".to_string(),
            ImportDiagnosticDetailValue::String(field.to_string()),
        )])),
    );
}

fn set_awd_node_index(rows: &mut Vec<Awd2NodeIndexEntry>, key: u32, value: i32) {
    if let Some(row) = rows.iter_mut().find(|row| row.key == key) {
        row.value = value;
    } else {
        rows.push(Awd2NodeIndexEntry { key, value });
    }
}
