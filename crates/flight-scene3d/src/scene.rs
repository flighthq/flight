use crate::{Node3DFields, Node3DRef, Scene3DMetadata, create_node3d, publish_node3d};
use flight_animation::AnimationClip;
use flight_entity::{EntityRuntimeSlot, Ref};
use flight_image::ImageResourceReference;
use std::collections::HashMap;

pub type Scene3DRuntime = flight_entity::EntityRuntime;

pub struct Scene3D {
    runtime: EntityRuntimeSlot,
    pub animations: HashMap<String, Ref<AnimationClip>>,
    pub metadata: Option<Ref<Scene3DMetadata>>,
    pub resources: Vec<ImageResourceReference>,
    pub root: Node3DRef,
}
/// Creates one document and its actual root, without allocating a temporary root through Default.
/// Assign authored root enabled/name fields afterward (D23, Principal c0f9227c).
// flight-lint: allow(conform-params) D23: authored root fields are assigned after construction
pub fn create_scene3d() -> Scene3D {
    let runtime = EntityRuntimeSlot::default();
    let root = publish_node3d(create_node3d::<Node3DFields>(None));
    return Scene3D {
        runtime,
        animations: HashMap::new(),
        metadata: None,
        resources: Vec::new(),
        root,
    };
}

/// The construction initializer creates the document's root, as in the source; it preserves the
/// document Entity runtime. Authored fields are applied to that root after initialization.
// flight-lint: allow(conform-params) D23: authored root fields are assigned after initialization
pub fn initialize_scene3d(out: &mut Scene3D) {
    let root = publish_node3d(create_node3d::<Node3DFields>(None));
    out.animations = HashMap::new();
    out.metadata = None;
    out.resources = Vec::new();
    out.root = root;
}
impl Default for Scene3D {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            animations: HashMap::new(),
            metadata: None,
            resources: Vec::new(),
            root: publish_node3d(Node3DFields::default()),
        };
    }
}
flight_entity::impl_entity!(Scene3D);
