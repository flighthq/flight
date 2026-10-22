use crate::gltf_anisotropy::GLTF_ANISOTROPY_EXTENSION_HANDLER;
use crate::gltf_clearcoat::GLTF_CLEARCOAT_EXTENSION_HANDLER;
use crate::gltf_emissive_strength::GLTF_EMISSIVE_STRENGTH_EXTENSION_HANDLER;
use crate::gltf_extension_handler_registry::register_gltf_extension_handler;
use crate::gltf_iridescence::GLTF_IRIDESCENCE_EXTENSION_HANDLER;
use crate::gltf_sheen::GLTF_SHEEN_EXTENSION_HANDLER;
use crate::gltf_specular::GLTF_SPECULAR_EXTENSION_HANDLER;
use crate::gltf_specular_glossiness::GLTF_SPECULAR_GLOSSINESS_EXTENSION_HANDLER;
use crate::gltf_transmission_volume::{
    GLTF_IOR_EXTENSION_HANDLER, GLTF_TRANSMISSION_EXTENSION_HANDLER, GLTF_VOLUME_EXTENSION_HANDLER,
};
use crate::gltf_types::GltfExtensionHandler;
use crate::gltf_unlit::GLTF_UNLIT_EXTENSION_HANDLER;
use flight_entity::Ref;

pub fn register_gltf_material_extension_handlers(handlers: &mut Vec<Ref<GltfExtensionHandler>>) {
    register_gltf_extension_handler(handlers, GLTF_ANISOTROPY_EXTENSION_HANDLER.clone());
    register_gltf_extension_handler(handlers, GLTF_CLEARCOAT_EXTENSION_HANDLER.clone());
    register_gltf_extension_handler(handlers, GLTF_EMISSIVE_STRENGTH_EXTENSION_HANDLER.clone());
    register_gltf_extension_handler(handlers, GLTF_IRIDESCENCE_EXTENSION_HANDLER.clone());
    register_gltf_extension_handler(handlers, GLTF_SHEEN_EXTENSION_HANDLER.clone());
    register_gltf_extension_handler(handlers, GLTF_SPECULAR_EXTENSION_HANDLER.clone());
    register_gltf_extension_handler(handlers, GLTF_SPECULAR_GLOSSINESS_EXTENSION_HANDLER.clone());
    register_gltf_extension_handler(handlers, GLTF_IOR_EXTENSION_HANDLER.clone());
    register_gltf_extension_handler(handlers, GLTF_TRANSMISSION_EXTENSION_HANDLER.clone());
    register_gltf_extension_handler(handlers, GLTF_VOLUME_EXTENSION_HANDLER.clone());
    register_gltf_extension_handler(handlers, GLTF_UNLIT_EXTENSION_HANDLER.clone());
}
