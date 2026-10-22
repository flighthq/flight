use crate::gltf_extension_handler_registry::register_gltf_extension_handler;
use crate::gltf_punctual_lights::GLTF_PUNCTUAL_LIGHTS_EXTENSION_HANDLER;
use crate::gltf_types::GltfExtensionHandler;
use flight_entity::Ref;

pub fn register_gltf_lighting_extension_handlers(handlers: &mut Vec<Ref<GltfExtensionHandler>>) {
    register_gltf_extension_handler(handlers, GLTF_PUNCTUAL_LIGHTS_EXTENSION_HANDLER.clone());
}
