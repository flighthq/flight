use crate::{
    Node3DFields, Node3DRef, PartialNode3D, Scene3DMetadata, create_node3d, publish_node3d,
};
use flight_animation::AnimationClip;
use flight_entity::{EntityRuntimeSlot, Ref, allocate_entity};
use flight_image::ImageResourceReference;
use flight_node::PartialNode;
use std::collections::HashMap;

pub type Scene3DRuntime = flight_entity::EntityRuntime;

pub struct Scene3D {
    runtime: EntityRuntimeSlot,
    pub animations: HashMap<String, Ref<AnimationClip>>,
    pub metadata: Option<Ref<Scene3DMetadata>>,
    pub resources: Vec<ImageResourceReference>,
    pub root: Node3DRef,
}
pub fn create_scene3d(obj: Option<&PartialNode>) -> Scene3D {
    let mut out: Scene3D = allocate_entity();
    initialize_scene3d(&mut out, obj);
    return out;
}
pub fn initialize_scene3d(out: &mut Scene3D, obj: Option<&PartialNode>) {
    out.animations = HashMap::new();
    out.metadata = None;
    out.resources = Vec::new();
    out.root = publish_node3d(create_node3d::<Node3DFields>(
        None,
        Some(&PartialNode3D {
            enabled: obj.and_then(|o| o.enabled),
            name: obj.and_then(|o| o.name.clone()),
            alpha: None,
            visible: None,
        }),
    ));
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
