use crate::gltf_types::GltfExtensionHandler;
use flight_entity::Ref;

pub fn register_gltf_extension_handler(
    handlers: &mut Vec<Ref<GltfExtensionHandler>>,
    handler: Ref<GltfExtensionHandler>,
) {
    let kind = handler.read().unwrap().kind.clone();
    let index = handlers
        .iter()
        .position(|registered| registered.read().unwrap().kind == kind);
    if let Some(index) = index {
        handlers[index] = handler;
    } else {
        handlers.push(handler);
    }
}
