use crate::gltf_animations::GLTF_ANIMATIONS_CORE_FEATURE_HANDLER;
use crate::gltf_core_feature_registry::register_gltf_core_feature_handler;
use crate::gltf_types::GltfCoreFeatureHandler;
use flight_entity::Ref;

pub fn register_gltf_animation_handlers(handlers: &mut Vec<Ref<GltfCoreFeatureHandler>>) {
    register_gltf_core_feature_handler(handlers, GLTF_ANIMATIONS_CORE_FEATURE_HANDLER.clone());
}
