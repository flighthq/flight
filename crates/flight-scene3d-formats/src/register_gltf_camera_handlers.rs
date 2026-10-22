use crate::gltf_cameras::GLTF_CAMERAS_CORE_FEATURE_HANDLER;
use crate::gltf_core_feature_registry::register_gltf_core_feature_handler;
use crate::gltf_types::GltfCoreFeatureHandler;
use flight_entity::Ref;

pub fn register_gltf_camera_handlers(handlers: &mut Vec<Ref<GltfCoreFeatureHandler>>) {
    register_gltf_core_feature_handler(handlers, GLTF_CAMERAS_CORE_FEATURE_HANDLER.clone());
}
