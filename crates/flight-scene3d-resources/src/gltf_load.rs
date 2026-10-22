use std::sync::{Arc, RwLock};

use flight_buffer::ArrayBufferView;
use flight_entity::{Record, Ref, set_record_value};
use flight_net::{HostNetCapability, NetState};
use flight_scene3d::Scene3DDocument;
use flight_scene3d_formats::{
    GltfCoreFeatureHandler, GltfExternalBuffer, GltfExternalBufferView, GltfImportOptions,
    GltfJsonSource, GltfSource, parse_glb_with_core_feature_handlers,
    parse_gltf_with_core_feature_handlers,
};
use futures::future::join_all;
use serde_json::Value;

use crate::scene_document_source::{
    get_scene3d_document_base_path_from_url, get_scene3d_document_load_options,
    load_scene3d_document_bytes_from_url, load_scene3d_document_text_from_url,
};
use crate::types::*;

// The source's `/^[a-zA-Z][a-zA-Z0-9+.-]*:/` scheme test, spelled out over the ASCII bytes.
fn has_gltf_uri_scheme(uri: &str) -> bool {
    let bytes = uri.as_bytes();
    if bytes.first().is_none_or(|first| !first.is_ascii_alphabetic()) {
        return false;
    }
    for &byte in &bytes[1..] {
        if byte == b':' {
            return true;
        }
        if !(byte.is_ascii_alphanumeric() || byte == b'+' || byte == b'.' || byte == b'-') {
            return false;
        }
    }
    return false;
}

async fn load_gltf_external_buffers(
    host_net: &HostNetCapability,
    gltf: &Value,
    base_path: Option<&str>,
    options: Option<&Scene3DDocumentLoadOptions>,
    net_state: &NetState,
) -> Option<Ref<Record<GltfExternalBuffer>>> {
    let mut uris: Vec<String> = Vec::new();
    let buffers = gltf.get("buffers").and_then(Value::as_array);
    for buffer in buffers.into_iter().flatten() {
        let Some(uri) = buffer.get("uri").and_then(Value::as_str) else {
            continue;
        };
        if !uri.starts_with("data:") && !uris.iter().any(|existing| existing == uri) {
            uris.push(uri.to_string());
        }
    }
    let loads = uris.iter().map(|uri| {
        let url = resolve_gltf_buffer_url(uri, base_path);
        async move { load_scene3d_document_bytes_from_url(host_net, &url, options, net_state).await }
    });
    let bytes: Vec<Option<ArrayBufferView>> = join_all(loads).await;
    let mut external_buffers = Record::default();
    for (uri, view) in uris.into_iter().zip(bytes) {
        set_record_value(
            &mut external_buffers,
            uri,
            GltfExternalBuffer::View(GltfExternalBufferView { view: view? }),
        );
    }
    return Some(Arc::new(RwLock::new(external_buffers)));
}

// flight-lint: allow(conform-params) D5 explicit canonical NetState replaces hidden transport guard state
pub async fn load_scene3d_document_from_glb_url_with_core_feature_handlers(
    host_net: &HostNetCapability,
    url: &str,
    core_feature_handlers: &[Ref<GltfCoreFeatureHandler>],
    options: Option<&GltfScene3DDocumentLoadOptions>,
    net_state: &NetState,
) -> Option<Ref<Scene3DDocument>> {
    let load = get_scene3d_document_load_options(options);
    let bytes = load_scene3d_document_bytes_from_url(host_net, url, load.as_ref(), net_state).await?;
    let import = GltfImportOptions {
        base_path: get_scene3d_document_base_path_from_url(url),
        draco_registry: None,
        extension_handlers: options.and_then(|options| options.extension_handlers.clone()),
        external_buffers: None,
    };
    return Some(parse_glb_with_core_feature_handlers(
        &bytes,
        core_feature_handlers,
        options.and_then(|options| options.diagnostics.as_ref()),
        Some(&import),
    ));
}

// flight-lint: allow(conform-params) D5 explicit canonical NetState replaces hidden transport guard state
pub async fn load_scene3d_document_from_gltf_url_with_core_feature_handlers(
    host_net: &HostNetCapability,
    url: &str,
    core_feature_handlers: &[Ref<GltfCoreFeatureHandler>],
    options: Option<&GltfScene3DDocumentLoadOptions>,
    net_state: &NetState,
) -> Option<Ref<Scene3DDocument>> {
    let load = get_scene3d_document_load_options(options);
    let source = load_scene3d_document_text_from_url(host_net, url, load.as_ref(), net_state).await?;
    // The source's `JSON.parse` plus its object check: arrays are objects there, null is not.
    let gltf = serde_json::from_str::<Value>(&source).ok()?;
    if !gltf.is_object() && !gltf.is_array() {
        return None;
    }
    let base_path = get_scene3d_document_base_path_from_url(url);
    let external_buffers =
        load_gltf_external_buffers(host_net, &gltf, base_path.as_deref(), load.as_ref(), net_state)
            .await?;
    let import = GltfImportOptions {
        base_path,
        draco_registry: None,
        extension_handlers: options.and_then(|options| options.extension_handlers.clone()),
        external_buffers: Some(external_buffers),
    };
    return Some(parse_gltf_with_core_feature_handlers(
        &GltfSource::Json(GltfJsonSource { source: &source }),
        core_feature_handlers,
        options.and_then(|options| options.diagnostics.as_ref()),
        Some(&import),
    ));
}

fn resolve_gltf_buffer_url(uri: &str, base_path: Option<&str>) -> String {
    let Some(base_path) = base_path else {
        return uri.to_string();
    };
    if uri.starts_with('/') || has_gltf_uri_scheme(uri) {
        return uri.to_string();
    }
    if base_path.ends_with('/') {
        return format!("{base_path}{uri}");
    }
    return format!("{base_path}/{uri}");
}
