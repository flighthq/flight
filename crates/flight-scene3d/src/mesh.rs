use crate::scene_node::initialize_node3d;
use crate::{MESH_KIND, MeshDeformer, Node3D, Node3DFields, Skin, publish_node3d};
use flight_entity::{Ref, Unknown, allocate_entity};
use flight_geometry::Aabb;
use flight_materials::Material3D;
use flight_meshgeometry::{MeshGeometry, MeshMorph, clone_mesh_geometry_for_deformation};
use flight_node::contract::set_node_local_matrix4;
use flight_node::{
    NodeRef, NodeSignals, enable_node_signals, get_node_signals, invalidate_node_local_transform,
};
use std::ops::{Deref, DerefMut};
use std::sync::{Arc, RwLock};

// flight-lint: allow(contract-vocabulary) D16 open Material3D family retains original heterogeneous EntityRefs through native structural dispatch
pub type MeshMaterials = Ref<Vec<Option<Ref<dyn Material3D>>>>;
pub struct Mesh {
    // Sibling leaf factories construct the inherited payload using the real required references,
    // avoiding a temporary MeshGeometry Entity. These fields remain private outside this crate.
    pub(crate) node: Node3DFields,
    pub(crate) state: MeshRuntime,
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

/// The geometry and material array are required defining references; assign authored node fields
/// after construction (D23, Principal c0f9227c).
// flight-lint: allow(conform-params) D23: authored kind and obj fields are assigned after create; required geometry/material handles stay positional
pub fn create_mesh(geometry: Ref<MeshGeometry>, materials: MeshMaterials) -> Ref<Mesh> {
    let mut mesh = Mesh {
        node: allocate_entity(),
        state: MeshRuntime::default(),
        geometry: geometry.clone(),
        materials: materials.clone(),
        morph: None,
        skin: None,
    };
    initialize_mesh(&mut mesh, geometry, materials);
    return publish_node3d(mesh);
}

/// Initializes a fresh Mesh, retaining the actual geometry/material array and Entity runtime.
// flight-lint: allow(conform-extra) D23 I: approved missing public Mesh construction initializer
pub fn initialize_mesh(out: &mut Mesh, geometry: Ref<MeshGeometry>, materials: MeshMaterials) {
    initialize_node3d(out, Some(MESH_KIND.to_string()));
    out.state = MeshRuntime::default();
    out.geometry = geometry;
    out.materials = materials;
    out.morph = None;
    out.skin = None;
}

pub fn clone_mesh(source: &Mesh) -> Ref<Mesh> {
    let geometry = if source.skin.is_some() || source.morph.is_some() {
        Arc::new(RwLock::new(clone_mesh_geometry_for_deformation(
            &source.geometry.read().unwrap(),
        )))
    } else {
        source.geometry.clone()
    };
    let cloned = {
        let out = create_mesh(
            geometry,
            Arc::new(RwLock::new(source.materials.read().unwrap().clone())),
        );
        {
            let mut fields = out.write().unwrap();
            fields.kind = source.kind.clone();
            fields.enabled = source.enabled;
            fields.name = source.name.clone();
        }
        out
    };
    {
        let mut c = cloned.write().unwrap();
        c.alpha = source.alpha;
        flight_geometry::copy_vector3(&mut c.position, &source.position);
        flight_geometry::copy_quaternion(&mut c.rotation, &source.rotation);
        flight_geometry::copy_vector3(&mut c.scale, &source.scale);
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
