use crate::{
    Node3DFields, Node3DRef, PartialNode3D, Scene3D, Scene3DAnimationTarget, Scene3DDocument,
    Scene3DDocumentMaterial, Scene3DDocumentNode, Skeleton3D, Skin, create_mesh, create_node3d,
    create_scene3d, publish_node3d,
};
use flight_animation::{create_animation_channel, create_animation_clip};
use flight_entity::{Ref, allocate_entity};
use flight_materials::contract::{Material3D, create_material3d};
use flight_node::{NodeRef, PartialNode, add_node_child, invalidate_node_local_transform};
use std::sync::{Arc, RwLock};

pub fn create_scene3d_from_document(
    document: &Scene3DDocument,
    scene_index: Option<i32>,
) -> Scene3D {
    let nodes = build_document_nodes(document);
    apply_document_skins(document, &nodes);
    let mut scene = create_scene3d(None);
    if let Some(s) = document.scenes.get(scene_index.unwrap_or(0) as usize) {
        let root: NodeRef = scene.root.clone();
        for index in &s.root_nodes {
            if let Some(node) = nodes.get(*index as usize) {
                let child: NodeRef = node.clone();
                add_node_child(&root, &child);
            }
        }
    }
    attach_document_animations(document, &nodes, &mut scene);
    scene.metadata = document.metadata.clone();
    scene.resources = document.resources.clone();
    return scene;
}
pub fn create_scene3ds_from_document(document: &Scene3DDocument) -> Vec<Scene3D> {
    let nodes = build_document_nodes(document);
    apply_document_skins(document, &nodes);
    let mut scenes = Vec::new();
    for source in &document.scenes {
        let mut scene = create_scene3d(None);
        let root: NodeRef = scene.root.clone();
        for index in &source.root_nodes {
            if let Some(node) = nodes.get(*index as usize) {
                let child: NodeRef = node.clone();
                add_node_child(&root, &child);
            }
        }
        scene.resources = document.resources.clone();
        scenes.push(scene);
    }
    if let Some(first) = scenes.first_mut() {
        attach_document_animations(document, &nodes, first);
        first.metadata = document.metadata.clone();
    }
    return scenes;
}
fn apply_document_skins(document: &Scene3DDocument, nodes: &[Node3DRef]) {
    let mut skins = Vec::new();
    for source in &document.skins {
        let mut joints = Vec::new();
        let mut names = Vec::new();
        for index in &source.joints {
            if let Some(joint) = nodes.get(*index as usize) {
                names.push(
                    joint
                        .read()
                        .unwrap()
                        .node_fields()
                        .name
                        .clone()
                        .unwrap_or_default(),
                );
                joints.push(joint.clone());
            }
        }
        let mut inverse_bind_matrices = vec![0.0; joints.len() * 16].into_boxed_slice();
        for j in 0..source.inverse_bind.len().min(joints.len()) {
            inverse_bind_matrices[j * 16..j * 16 + 16].copy_from_slice(&source.inverse_bind[j].m);
        }
        let mut skeleton: Skeleton3D = allocate_entity();
        skeleton.inverse_bind_matrices = Arc::new(RwLock::new(inverse_bind_matrices));
        skeleton.joint_matrices =
            Arc::new(RwLock::new(vec![0.0; joints.len() * 16].into_boxed_slice()));
        skeleton.normal_matrices =
            Arc::new(RwLock::new(vec![0.0; joints.len() * 12].into_boxed_slice()));
        skeleton.joints = Arc::new(RwLock::new(joints));
        skeleton.names = if names.iter().any(|n| !n.is_empty()) {
            Some(names)
        } else {
            None
        };
        skins.push(Arc::new(RwLock::new(Skin {
            skeleton: Arc::new(RwLock::new(skeleton)),
            skeleton_root: None,
        })));
    }
    for (i, source) in document.nodes.iter().enumerate() {
        let Some(mesh_index) = source.mesh else {
            continue;
        };
        let Some(skin_index) = document
            .meshes
            .get(mesh_index as usize)
            .and_then(|m| m.skin)
        else {
            continue;
        };
        if let Some(mesh) = nodes[i].write().unwrap().as_mesh_mut() {
            mesh.skin = skins.get(skin_index as usize).cloned();
        }
    }
}
fn attach_document_animations(
    document: &Scene3DDocument,
    nodes: &[Node3DRef],
    scene: &mut Scene3D,
) {
    for a in 0..document.animations.len() {
        let source = &document.animations[a];
        let mut channels = Vec::new();
        for channel in &source.channels {
            if let Some(node) = nodes.get(channel.node as usize) {
                let node: Node3DRef = node.clone();
                channels.push(create_animation_channel(
                    &channel.track,
                    Some(Arc::new(Scene3DAnimationTarget {
                        node,
                        path: channel.path,
                    })),
                ));
            }
        }
        if channels.is_empty() {
            continue;
        }
        scene.animations.insert(
            source
                .name
                .clone()
                .unwrap_or_else(|| format!("animation{a}")),
            Arc::new(RwLock::new(create_animation_clip(
                channels,
                Some(source.duration),
                &[],
            ))),
        );
    }
}
fn build_document_node(
    node: &Scene3DDocumentNode,
    document: &Scene3DDocument,
    materials: &[Ref<dyn Material3D>],
) -> Node3DRef {
    let Some(index) = node.mesh else {
        let bare: Node3DFields = create_node3d(
            Some(node.kind.clone()),
            Some(&PartialNode3D {
                name: node.name.clone(),
                alpha: None,
                enabled: None,
                visible: None,
            }),
        );
        return publish_node3d(bare);
    };
    let mesh_source = document
        .meshes
        .get(index as usize)
        .expect("Cannot read properties of undefined (reading 'materials')");
    let materials = mesh_source
        .materials
        .iter()
        .map(|i| materials.get(*i as usize).cloned())
        .collect();
    let mesh = create_mesh(
        mesh_source.geometry.clone(),
        Arc::new(RwLock::new(materials)),
        Some(node.kind.clone()),
        Some(&PartialNode {
            enabled: None,
            name: node.name.clone(),
        }),
    );
    mesh.write().unwrap().morph = mesh_source.morph.clone();
    return mesh;
}
fn build_document_nodes(document: &Scene3DDocument) -> Vec<Node3DRef> {
    let materials: Vec<Ref<dyn Material3D>> = document
        .materials
        .iter()
        .map(|m| match m {
            Scene3DDocumentMaterial::Entity(e) => e.material.clone(),
            Scene3DDocumentMaterial::Fields(f) => {
                let mut material = create_material3d(f.kind.clone());
                material.name = f.name.clone();
                Arc::new(RwLock::new(material)) as Ref<dyn Material3D>
            }
        })
        .collect();
    let nodes: Vec<Node3DRef> = document
        .nodes
        .iter()
        .map(|n| build_document_node(n, document, &materials))
        .collect();
    for (i, source) in document.nodes.iter().enumerate() {
        {
            let mut n = nodes[i].write().unwrap();
            let f = n.node3d_fields_mut();
            flight_geometry::copy_vector3(&mut f.position, &source.transform.position);
            flight_geometry::copy_quaternion(&mut f.rotation, &source.transform.rotation);
            flight_geometry::copy_vector3(&mut f.scale, &source.transform.scale);
        }
        let node: NodeRef = nodes[i].clone();
        invalidate_node_local_transform(&node);
        for index in &source.children {
            if let Some(child) = nodes.get(*index as usize) {
                let child: NodeRef = child.clone();
                add_node_child(&node, &child);
            }
        }
    }
    return nodes;
}
