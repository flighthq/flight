use flight_net::{HostNetCapability, NetState};
use flight_scene3d::Scene3DDocument;
use flight_scene3d_formats::parse3ds;

use crate::scene_document_source::{
    get_scene3d_document_bytes, load_scene3d_document_bytes_from_url,
    set_scene3d_document_resource_base_path_from_url,
};
use crate::types::*;

/// Fetches a Autodesk 3DS file and parses it into a format-neutral document. Fetches only the file: the
/// document's texture references stay unresolved for an explicit resource pass. Returns `None` on
/// transport failure; it never creates a renderer or GPU resource.
// flight-lint: allow(conform-params) D5 explicit canonical NetState replaces hidden transport guard state
pub async fn load_scene3d_document_from_3ds_url(
    host_net: &HostNetCapability,
    url: &str,
    options: Option<&Scene3DDocumentLoadOptions>,
    net_state: &NetState,
) -> Option<Scene3DDocument> {
    let bytes = load_scene3d_document_bytes_from_url(host_net, url, options, net_state).await?;
    let bytes = get_scene3d_document_bytes(&bytes);
    let document = parse3ds(&bytes.read().unwrap(), None, None);
    set_scene3d_document_resource_base_path_from_url(&document, url);
    return Some(document);
}
