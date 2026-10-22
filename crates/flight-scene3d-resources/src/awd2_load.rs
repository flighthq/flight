use flight_entity::Ref;
use flight_net::{HostNetCapability, NetState};
use flight_scene3d::Scene3DDocument;
use flight_scene3d_formats::{Awd2ParseOptions, parse_awd2};

use crate::scene_document_source::{
    get_scene3d_document_bytes, load_scene3d_document_bytes_from_url,
    set_scene3d_document_resource_base_path_from_url,
};
use crate::types::*;

/// Fetches an Away3D AWD file and parses it into a format-neutral document (geometry, skins and its
/// skeleton animation). Fetches only the file: texture references stay unresolved for an explicit
/// resource pass. Returns `None` on transport failure.
// flight-lint: allow(conform-params) D5 explicit canonical NetState replaces hidden transport guard state
pub async fn load_scene3d_document_from_awd2_url(
    host_net: &HostNetCapability,
    url: &str,
    parse: &Awd2ParseOptions,
    options: Option<&Scene3DDocumentLoadOptions>,
    net_state: &NetState,
) -> Option<Ref<Scene3DDocument>> {
    let bytes = load_scene3d_document_bytes_from_url(host_net, url, options, net_state).await?;
    let document = parse_awd2(&get_scene3d_document_bytes(&bytes), parse, None);
    set_scene3d_document_resource_base_path_from_url(&document.read().unwrap(), url);
    return Some(document);
}
