use crate::{Node3DFields, PartialNode3D, Scene3DMetadata, create_node3d};
use flight_animation::AnimationClip;
use flight_entity::{EntityRuntimeSlot, Ref, allocate_entity};
use flight_image::ImageResourceReference;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

pub struct Scene3D {
    runtime: EntityRuntimeSlot,
    pub animations: HashMap<String, Ref<AnimationClip>>,
    pub metadata: Option<Ref<Scene3DMetadata>>,
    pub resources: Vec<ImageResourceReference>,
    pub root: Ref<Node3DFields>,
}
pub fn create_scene3d(obj: Option<&PartialNode3D>) -> Scene3D {
    let mut out: Scene3D = allocate_entity();
    initialize_scene3d(&mut out, obj);
    return out;
}
pub fn initialize_scene3d(out: &mut Scene3D, obj: Option<&PartialNode3D>) {
    out.animations = HashMap::new();
    out.metadata = None;
    out.resources = Vec::new();
    out.root = Arc::new(RwLock::new(create_node3d(None, obj)));
}
impl Default for Scene3D {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            animations: HashMap::new(),
            metadata: None,
            resources: Vec::new(),
            root: Arc::new(RwLock::new(Node3DFields::default())),
        };
    }
}
flight_entity::impl_entity!(Scene3D);
