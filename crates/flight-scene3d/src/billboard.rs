use crate::scene_node::initialize_node3d;
use crate::{
    BILLBOARD_KIND, BillboardMode, Mesh, MeshMaterials, MeshRuntime, Node3D, Node3DFields,
    Node3DRuntime, publish_node3d,
};
use flight_entity::{Ref, allocate_entity};
use flight_meshgeometry::MeshGeometry;
use flight_node::{NodeRef, NodeSignals, enable_node_signals, get_node_signals};
use std::ops::{Deref, DerefMut};

#[derive(Default)]
pub struct Billboard {
    mesh: Mesh,
    pub mode: BillboardMode,
}
pub type BillboardRuntime = Node3DRuntime;

/// Retains the two required defining references. Assign authored mode, kind and node fields afterward.
// flight-lint: allow(conform-params) D23 (Principal c0f9227c): mode/kind/obj are authored fields; geometry/material handles remain positional
pub fn create_billboard(geometry: Ref<MeshGeometry>, materials: MeshMaterials) -> Ref<Billboard> {
    let mut out = Billboard {
        mesh: Mesh {
            node: allocate_entity(),
            state: MeshRuntime::default(),
            geometry: geometry.clone(),
            materials: materials.clone(),
            morph: None,
            skin: None,
        },
        mode: BillboardMode::Full,
    };
    initialize_billboard(&mut out, geometry, materials);
    return publish_node3d(out);
}

/// Initializes the actual Billboard leaf, preserving its one Entity and inherited Mesh payload.
// flight-lint: allow(conform-extra) D23 I: approved missing public Billboard construction initializer
pub fn initialize_billboard(
    out: &mut Billboard,
    geometry: Ref<MeshGeometry>,
    materials: MeshMaterials,
) {
    initialize_node3d(out, Some(BILLBOARD_KIND.to_string()));
    out.mesh.state = MeshRuntime::default();
    out.geometry = geometry;
    out.materials = materials;
    out.morph = None;
    out.skin = None;
    out.mode = BillboardMode::Full;
}
pub fn enable_billboard_signals(source: &NodeRef) -> Ref<NodeSignals> {
    return enable_node_signals(source);
}
pub fn get_billboard_runtime(source: &Billboard) -> &BillboardRuntime {
    return source.node3d_fields().node3d_runtime();
}
pub fn get_billboard_signals(source: &Billboard) -> Option<Ref<NodeSignals>> {
    return get_node_signals(source);
}
pub fn is_billboard(source: &dyn Node3D) -> bool {
    return source.as_mesh().is_some() && source.billboard_mode().is_some();
}

impl Default for BillboardMode {
    fn default() -> Self {
        return BillboardMode::Full;
    }
}
// flight-lint: allow(sugar-delegates) D16 kind composes actual Mesh and Node3D fields without a projection or second UID
impl Node3D for Billboard {
    fn as_mesh(&self) -> Option<&Mesh> {
        return Some(&self.mesh);
    }
    fn as_mesh_mut(&mut self) -> Option<&mut Mesh> {
        return Some(&mut self.mesh);
    }
    fn billboard_mode(&self) -> Option<BillboardMode> {
        return Some(self.mode);
    }
    fn node3d_fields(&self) -> &Node3DFields {
        return self.mesh.node3d_fields();
    }
    fn node3d_fields_mut(&mut self) -> &mut Node3DFields {
        return self.mesh.node3d_fields_mut();
    }
}
// flight-lint: allow(sugar-delegates) D16 inherited flat Mesh fields
impl Deref for Billboard {
    type Target = Mesh;
    fn deref(&self) -> &Mesh {
        return &self.mesh;
    }
}
// flight-lint: allow(sugar-delegates) D16 inherited flat Mesh fields
impl DerefMut for Billboard {
    fn deref_mut(&mut self) -> &mut Mesh {
        return &mut self.mesh;
    }
}
crate::impl_node3d!(Billboard, custom_node3d);
