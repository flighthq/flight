use crate::collada_xml::{collada_child, collada_children};
use flight_entity::Ref;
use flight_geometry::{
    Matrix4, compose_matrix4_from_transform3d, copy_matrix4, create_matrix4, multiply_matrix4,
};
use flight_scene3d::{Scene3DDocument, Scene3DDocumentMesh, Scene3DDocumentNode};
use flight_xml::XmlElement;
use std::sync::{Arc, RwLock};

#[derive(Debug, PartialEq, Eq)]
pub struct ColladaIndexEntry {
    pub key: String,
    pub value: i32,
}

struct ColladaWorldPending {
    node_index: i32,
    parent: Option<Ref<Matrix4>>,
}

pub fn apply_collada_bind_material(
    document: &mut Scene3DDocument,
    mesh_index: i32,
    instance_element: &Ref<XmlElement>,
    primitive_symbols: Option<&[String]>,
    material_indices: &[ColladaIndexEntry],
) -> i32 {
    let symbol_to_index = parse_collada_bind_material(instance_element, material_indices);
    return apply_collada_material_overrides(
        document,
        mesh_index,
        primitive_symbols,
        &symbol_to_index,
    );
}

pub fn apply_collada_material_overrides(
    document: &mut Scene3DDocument,
    mesh_index: i32,
    primitive_symbols: Option<&[String]>,
    symbol_to_index: &[ColladaIndexEntry],
) -> i32 {
    let mut resolved = Vec::new();
    resolve_collada_primitive_symbols(&mut resolved, primitive_symbols, symbol_to_index);
    if resolved.is_empty() {
        return mesh_index;
    }
    let mesh = &mut document.meshes[mesh_index as usize];
    if mesh.materials.is_empty() {
        mesh.materials = resolved;
        return mesh_index;
    }
    if mesh.materials == resolved {
        return mesh_index;
    }
    let clone = Scene3DDocumentMesh {
        geometry: mesh.geometry.clone(),
        materials: resolved,
        name: mesh.name.clone(),
        skin: mesh.skin,
        morph: None,
    };
    let index = document.meshes.len() as i32;
    document.meshes.push(clone);
    return index;
}

// flight-lint: allow(conform-params) Principal21f7557f D24: required first computed world-matrix output, preserving source holes and capacity; queued children retain their original parent matrix handle
pub fn build_collada_node_world_matrices(
    out: &mut Vec<Option<Ref<Matrix4>>>,
    nodes: &[Scene3DDocumentNode],
    root_node_indices: &[i32],
) {
    out.clear();
    out.resize_with(nodes.len(), || None);
    let mut pending = Vec::new();
    for index in root_node_indices.iter().rev() {
        pending.push(ColladaWorldPending {
            node_index: *index,
            parent: None,
        });
    }
    while let Some(entry) = pending.pop() {
        let Some(node) = nodes.get(entry.node_index as usize) else {
            continue;
        };
        let mut local = create_matrix4();
        let mut world = create_matrix4();
        compose_matrix4_from_transform3d(&mut local, &node.transform);
        if let Some(parent) = entry.parent {
            multiply_matrix4(&mut world, &parent.read().unwrap(), &local);
        } else {
            copy_matrix4(&mut world, &local);
        }
        let world = Arc::new(RwLock::new(world));
        out[entry.node_index as usize] = Some(world.clone());
        for child in node.children.iter().rev() {
            pending.push(ColladaWorldPending {
                node_index: *child,
                parent: Some(world.clone()),
            });
        }
    }
}

pub fn parse_collada_bind_material(
    instance_element: &Ref<XmlElement>,
    material_indices: &[ColladaIndexEntry],
) -> Vec<ColladaIndexEntry> {
    let mut symbol_to_index: Vec<ColladaIndexEntry> = Vec::new();
    let Some(bind_material) = collada_child(Some(instance_element), "bind_material") else {
        return symbol_to_index;
    };
    let Some(technique) = collada_child(Some(&bind_material), "technique_common") else {
        return symbol_to_index;
    };
    let mut instances = Vec::new();
    collada_children(&mut instances, Some(&technique), "instance_material");
    for instance in instances {
        let instance = instance.read().unwrap();
        let Some(symbol) = instance
            .attributes
            .get("symbol")
            .filter(|symbol| !symbol.is_empty())
        else {
            continue;
        };
        let Some(target) = instance
            .attributes
            .get("target")
            .map(|target| target.strip_prefix('#').unwrap_or(target))
            .filter(|target| !target.is_empty())
        else {
            continue;
        };
        let Some(material_index) = material_indices
            .iter()
            .find(|entry| entry.key == target)
            .map(|entry| entry.value)
        else {
            continue;
        };
        if let Some(entry) = symbol_to_index
            .iter_mut()
            .find(|entry| entry.key == *symbol)
        {
            entry.value = material_index;
        } else {
            symbol_to_index.push(ColladaIndexEntry {
                key: symbol.clone(),
                value: material_index,
            });
        }
    }
    return symbol_to_index;
}

// flight-lint: allow(conform-params) Principal21f7557f D24: required first computed primitive-material index output, clear/fill retaining capacity
pub fn resolve_collada_primitive_symbols(
    out: &mut Vec<i32>,
    symbols: Option<&[String]>,
    symbol_to_index: &[ColladaIndexEntry],
) {
    out.clear();
    let Some(symbols) = symbols else {
        return;
    };
    if symbol_to_index.is_empty() {
        return;
    }
    for symbol in symbols {
        if let Some(entry) = symbol_to_index.iter().find(|entry| entry.key == *symbol) {
            out.push(entry.value);
        }
    }
}
