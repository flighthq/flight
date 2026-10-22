use std::sync::{Arc, RwLock};

use flight_buffer::{ArrayBufferView, get_array_buffer_storage};
use flight_entity::Ref;
use flight_image::ImageResourceReference;
use flight_loader::{LoadOptions, load_bytes, load_text};
use flight_net::{HostNetCapability, NetState};
use flight_scene3d::Scene3DDocument;

use crate::types::*;

pub fn get_scene3d_document_base_path_from_url(url: &str) -> Option<String> {
    let source = match url.find(['?', '#']) {
        Some(query) => &url[..query],
        None => url,
    };
    let slash = source.rfind('/')?;
    return Some(source[..slash].to_string());
}

/// The view's bytes as one shared buffer: the loaded storage itself when the view spans it (as a
/// fresh transport view does), otherwise a copy of the viewed range.
pub(crate) fn get_scene3d_document_bytes(view: &ArrayBufferView) -> Ref<Box<[u8]>> {
    let storage = get_array_buffer_storage(&view.buffer);
    let spans = view.byte_offset == 0 && view.byte_length == storage.read().unwrap().len();
    if spans {
        return storage;
    }
    let copy = storage.read().unwrap()[view.byte_offset..view.byte_offset + view.byte_length]
        .to_vec()
        .into_boxed_slice();
    return Arc::new(RwLock::new(copy));
}

pub(crate) fn get_scene3d_document_load_options(
    options: Option<&GltfScene3DDocumentLoadOptions>,
) -> Option<Scene3DDocumentLoadOptions> {
    return options.map(|options| Scene3DDocumentLoadOptions {
        progress: options.progress.clone(),
        signal: options.signal.clone(),
    });
}

fn get_scene3d_document_loader_options(options: &Scene3DDocumentLoadOptions) -> Ref<LoadOptions> {
    return Arc::new(RwLock::new(LoadOptions {
        progress: options.progress.clone(),
        signal: options.signal.clone(),
    }));
}

/// Fetches a scene file's raw bytes through the host net capability for the binary document loaders.
/// Returns the bytes on a 2xx response, or `None` on any expected transport or HTTP failure. No
/// resource resolution or renderer work happens here.
// flight-lint: allow(conform-params) D5 explicit canonical NetState replaces hidden transport guard state
pub async fn load_scene3d_document_bytes_from_url(
    host_net: &HostNetCapability,
    url: &str,
    options: Option<&Scene3DDocumentLoadOptions>,
    net_state: &NetState,
) -> Option<ArrayBufferView> {
    let input = options.map(get_scene3d_document_loader_options);
    return load_bytes(host_net, url, input.as_ref(), net_state).await;
}

/// Fetches a scene file's text through the host net capability for the text document loaders.
/// Returns the text on a 2xx response, or `None` on any expected transport or HTTP failure.
// flight-lint: allow(conform-params) D5 explicit canonical NetState replaces hidden transport guard state
pub async fn load_scene3d_document_text_from_url(
    host_net: &HostNetCapability,
    url: &str,
    options: Option<&Scene3DDocumentLoadOptions>,
    net_state: &NetState,
) -> Option<String> {
    let input = options.map(get_scene3d_document_loader_options);
    return load_text(host_net, url, input.as_ref(), net_state).await;
}

/// Carries the loaded model's directory onto relative external image references emitted by formats
/// whose parser consumed only in-hand bytes or text. Existing base paths are authoritative.
pub fn set_scene3d_document_resource_base_path_from_url(document: &Scene3DDocument, url: &str) {
    let Some(base_path) = get_scene3d_document_base_path_from_url(url) else {
        return;
    };
    for resource in &document.resources {
        if let ImageResourceReference::External(value) = resource {
            let mut reference = value.reference.write().unwrap();
            if reference.base_path.is_none() {
                reference.base_path = Some(base_path.clone());
            }
        }
    }
}
