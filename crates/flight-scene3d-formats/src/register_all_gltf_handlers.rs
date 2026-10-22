use crate::gltf_types::{GltfCoreFeatureHandler, GltfExtensionHandler};
use crate::register_gltf_animation_handlers::register_gltf_animation_handlers;
use crate::register_gltf_camera_handlers::register_gltf_camera_handlers;
use crate::register_gltf_lighting_extension_handlers::register_gltf_lighting_extension_handlers;
use crate::register_gltf_material_extension_handlers::register_gltf_material_extension_handlers;
use crate::register_gltf_skin_handlers::register_gltf_skin_handlers;
use flight_entity::Ref;

pub fn register_all_gltf_handlers(
    core_feature_handlers: &mut Vec<Ref<GltfCoreFeatureHandler>>,
    extension_handlers: &mut Vec<Ref<GltfExtensionHandler>>,
) {
    register_gltf_animation_handlers(core_feature_handlers);
    register_gltf_camera_handlers(core_feature_handlers);
    register_gltf_skin_handlers(core_feature_handlers);
    register_gltf_material_extension_handlers(extension_handlers);
    register_gltf_lighting_extension_handlers(extension_handlers);
}
