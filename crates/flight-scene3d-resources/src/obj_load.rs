use flight_net::{HostNetCapability, NetState};
use flight_scene3d::Scene3DDocument;
use flight_scene3d_formats::{ObjMaterialLibrary, parse_obj};

use crate::scene_document_source::{
    load_scene3d_document_text_from_url, set_scene3d_document_resource_base_path_from_url,
};
use crate::types::*;

/// Fetches a Wavefront OBJ file and parses it into a format-neutral document, using an optional
/// already-parsed MTL library for its materials. Fetches only the OBJ file: the `.mtl` sidecar and
/// its image URIs are the caller's. Returns `None` on transport failure.
// flight-lint: allow(conform-params) D5 explicit canonical NetState replaces hidden transport guard state
pub async fn load_scene3d_document_from_obj_url(
    host_net: &HostNetCapability,
    url: &str,
    materials: Option<&ObjMaterialLibrary>,
    options: Option<&Scene3DDocumentLoadOptions>,
    net_state: &NetState,
) -> Option<Scene3DDocument> {
    let source = load_scene3d_document_text_from_url(host_net, url, options, net_state).await?;
    let document = parse_obj(&source, materials, None, None);
    set_scene3d_document_resource_base_path_from_url(&document, url);
    return Some(document);
}
