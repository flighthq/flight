use crate::gltf_types::GltfCoreFeatureHandler;
use flight_entity::Ref;

pub fn register_gltf_core_feature_handler(
    handlers: &mut Vec<Ref<GltfCoreFeatureHandler>>,
    handler: Ref<GltfCoreFeatureHandler>,
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
