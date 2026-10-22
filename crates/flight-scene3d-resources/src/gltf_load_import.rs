use flight_entity::Ref;
use flight_net::{HostNetCapability, NetState};
use flight_scene3d::Scene3DDocument;
use flight_scene3d_formats::{
    GltfCoreFeatureHandler, register_gltf_animation_handlers, register_gltf_camera_handlers,
    register_gltf_skin_handlers,
};

use crate::gltf_load::{
    load_scene3d_document_from_glb_url_with_core_feature_handlers,
    load_scene3d_document_from_gltf_url_with_core_feature_handlers,
};
use crate::types::*;

fn get_full_gltf_core_feature_handlers() -> Vec<Ref<GltfCoreFeatureHandler>> {
    let mut handlers = Vec::new();
    register_gltf_animation_handlers(&mut handlers);
    register_gltf_camera_handlers(&mut handlers);
    register_gltf_skin_handlers(&mut handlers);
    return handlers;
}

fn get_gltf_core_feature_handlers(
    options: Option<&GltfScene3DDocumentLoadOptions>,
) -> Vec<Ref<GltfCoreFeatureHandler>> {
    return options
        .and_then(|options| options.core_feature_handlers.clone())
        .unwrap_or_else(get_full_gltf_core_feature_handlers);
}

// flight-lint: allow(conform-params) D5 explicit canonical NetState replaces hidden transport guard state
pub async fn load_scene3d_document_from_glb_url(
    host_net: &HostNetCapability,
    url: &str,
    options: Option<&GltfScene3DDocumentLoadOptions>,
    net_state: &NetState,
) -> Option<Ref<Scene3DDocument>> {
    let handlers = get_gltf_core_feature_handlers(options);
    return load_scene3d_document_from_glb_url_with_core_feature_handlers(
        host_net, url, &handlers, options, net_state,
    )
    .await;
}

// flight-lint: allow(conform-params) D5 explicit canonical NetState replaces hidden transport guard state
pub async fn load_scene3d_document_from_gltf_url(
    host_net: &HostNetCapability,
    url: &str,
    options: Option<&GltfScene3DDocumentLoadOptions>,
    net_state: &NetState,
) -> Option<Ref<Scene3DDocument>> {
    let handlers = get_gltf_core_feature_handlers(options);
    return load_scene3d_document_from_gltf_url_with_core_feature_handlers(
        host_net, url, &handlers, options, net_state,
    )
    .await;
}
