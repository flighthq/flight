use crate::{MESH_KIND, MeshDeformer, Node3D, Node3DFields, PartialNode3D, Skin, create_node3d};
use flight_entity::{Kind, Ref, Unknown};
use flight_geometry::Aabb;
use flight_materials::Material3D;
use flight_meshgeometry::{MeshGeometry, MeshMorph, clone_mesh_geometry_for_deformation};
use flight_node::contract::set_node_local_matrix4;
use flight_node::{
    NodeRef, NodeSignals, PartialNode, enable_node_signals, get_node_signals,
    invalidate_node_local_transform,
};
use std::ops::{Deref, DerefMut};
use std::sync::{Arc, RwLock};

// flight-lint: allow(contract-vocabulary) D16 open Material3D family retains original heterogeneous EntityRefs through native structural dispatch
pub type MeshMaterials = Ref<Vec<Option<Ref<dyn Material3D>>>>;
pub struct Mesh {
    node: Node3DFields,
    state: MeshRuntime,
    pub geometry: Ref<MeshGeometry>,
    pub materials: MeshMaterials,
    pub morph: Option<Ref<MeshMorph>>,
    pub skin: Option<Ref<Skin>>,
}
pub type MeshRuntime = MeshDeformRuntime;

#[derive(Default)]
pub struct MeshDeformRuntime {
    pub deformed_local_bounds: Option<Aabb>,
}

pub fn create_mesh(
    geometry: Ref<MeshGeometry>,
    materials: MeshMaterials,
    kind: Option<Kind>,
    obj: Option<&PartialNode>,
) -> Ref<Mesh> {
    let mut mesh: Mesh = create_node3d(
        Some(kind.unwrap_or_else(|| MESH_KIND.to_string())),
        Some(&PartialNode3D {
            enabled: obj.and_then(|o| o.enabled),
            name: obj.and_then(|o| o.name.clone()),
            alpha: None,
            visible: None,
        }),
    );
    mesh.geometry = geometry;
    mesh.materials = materials;
    return Arc::new(RwLock::new(mesh));
}

pub fn clone_mesh(source: &Mesh) -> Ref<Mesh> {
    let geometry = if source.skin.is_some() || source.morph.is_some() {
        Arc::new(RwLock::new(clone_mesh_geometry_for_deformation(
            &source.geometry.read().unwrap(),
        )))
    } else {
        source.geometry.clone()
    };
    let cloned = create_mesh(
        geometry,
        Arc::new(RwLock::new(source.materials.read().unwrap().clone())),
        Some(source.kind.clone()),
        Some(&PartialNode {
            enabled: Some(source.enabled),
            name: source.name.clone(),
        }),
    );
    {
        let mut c = cloned.write().unwrap();
        c.alpha = source.alpha;
        c.position = flight_geometry::clone_vector3(&source.position);
        c.rotation = flight_geometry::clone_quaternion(&source.rotation);
        c.scale = flight_geometry::clone_vector3(&source.scale);
        c.skin = source.skin.clone();
        c.morph = source.morph.as_ref().map(|m| {
            let m = m.read().unwrap();
            return Arc::new(RwLock::new(MeshMorph {
                targets: m.targets.clone(),
                weights: m.weights.clone(),
            }));
        });
    }
    let clone_node: NodeRef = cloned.clone();
    invalidate_node_local_transform(&clone_node);
    // Read the actual authored detached cache without locking the source's own Ref again.
    if source.node3d_runtime().transform3d.local_matrix4_detached {
        let node: NodeRef = cloned.clone();
        if let Some(matrix) = &source.node3d_runtime().transform3d.local_matrix4 {
            set_node_local_matrix4(&node, matrix);
        }
    }
    return cloned;
}

pub fn enable_mesh_signals(source: &NodeRef) -> Ref<NodeSignals> {
    return enable_node_signals(source);
}
pub fn get_mesh_deformer(source: &Mesh) -> MeshDeformer {
    if source.skin.is_some() {
        return MeshDeformer::Skeletal;
    }
    if source.morph.is_some() {
        return MeshDeformer::Morph;
    }
    return MeshDeformer::None;
}
pub fn get_mesh_runtime(source: &Mesh) -> &MeshRuntime {
    return &source.state;
}
pub fn get_mesh_signals(source: &Mesh) -> Option<Ref<NodeSignals>> {
    return get_node_signals(source);
}
pub fn is_mesh(source: &Unknown) -> bool {
    let Some(value) = source else {
        return false;
    };
    let Some(node) = value.downcast_ref::<NodeRef>() else {
        return false;
    };
    let guard = node.read().unwrap();
    return crate::scene_node::as_node3d(&*guard).is_some_and(|n| n.as_mesh().is_some());
}

impl Default for Mesh {
    fn default() -> Self {
        return Self {
            node: Node3DFields::default(),
            state: MeshRuntime::default(),
            geometry: Arc::new(RwLock::new(MeshGeometry::default())),
            materials: Arc::new(RwLock::new(Vec::new())),
            morph: None,
            skin: None,
        };
    }
}
// flight-lint: allow(sugar-delegates) D16 open-family composition retains the real Mesh fields and single Node Entity slot
impl Node3D for Mesh {
    fn as_mesh(&self) -> Option<&Mesh> {
        return Some(self);
    }
    fn as_mesh_mut(&mut self) -> Option<&mut Mesh> {
        return Some(self);
    }
    fn node3d_fields(&self) -> &Node3DFields {
        return &self.node;
    }
    fn node3d_fields_mut(&mut self) -> &mut Node3DFields {
        return &mut self.node;
    }
}
// flight-lint: allow(sugar-delegates) D16 flat inherited node fields
impl Deref for Mesh {
    type Target = Node3DFields;
    fn deref(&self) -> &Self::Target {
        return &self.node;
    }
}
// flight-lint: allow(sugar-delegates) D16 flat inherited node fields
impl DerefMut for Mesh {
    fn deref_mut(&mut self) -> &mut Self::Target {
        return &mut self.node;
    }
}
crate::impl_node3d!(Mesh, custom_node3d);

// flight-lint: allow(sugar-delegates) D16 kind-owned mutable runtime tier access is structural plumbing for deformers, not convenience logic
impl Mesh {
    #[doc(hidden)]
    pub fn mesh_runtime_mut(&mut self) -> &mut MeshRuntime {
        return &mut self.state;
    }
}
