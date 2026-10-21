use crate::{
    BILLBOARD_KIND, BillboardMode, Mesh, MeshMaterials, Node3D, Node3DFields, Node3DRuntime,
    PartialNode3D, create_node3d,
};
use flight_entity::{Kind, Ref};
use flight_meshgeometry::MeshGeometry;
use flight_node::{NodeRef, NodeSignals, PartialNode, enable_node_signals, get_node_signals};
use std::ops::{Deref, DerefMut};
use std::sync::{Arc, RwLock};

#[derive(Default)]
pub struct Billboard {
    mesh: Mesh,
    pub mode: BillboardMode,
}
pub type BillboardRuntime = Node3DRuntime;

pub fn create_billboard(
    geometry: Ref<MeshGeometry>,
    materials: MeshMaterials,
    mode: Option<BillboardMode>,
    kind: Option<Kind>,
    obj: Option<&PartialNode>,
) -> Ref<Billboard> {
    let mut out: Billboard = create_node3d(
        Some(kind.unwrap_or_else(|| BILLBOARD_KIND.to_string())),
        Some(&PartialNode3D {
            enabled: obj.and_then(|o| o.enabled),
            name: obj.and_then(|o| o.name.clone()),
            alpha: None,
            visible: None,
        }),
    );
    out.geometry = geometry;
    out.materials = materials;
    out.mode = mode.unwrap_or(BillboardMode::Full);
    return Arc::new(RwLock::new(out));
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
