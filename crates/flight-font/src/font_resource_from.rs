use flight_buffer::ArrayBufferView;
use flight_entity::Unknown;

use crate::_font_face_load::*;
use crate::types::*;

/// Loads a face from one exact byte view and attaches it only after loading and registration finish.
pub async fn load_font_resource_from_bytes(
    host_font_loading: &HostFontLoadingCapability,
    out: &mut FontResource,
    bytes: &ArrayBufferView,
) -> Result<(), Unknown> {
    let face = _load_font_face_from_bytes(host_font_loading, &out.family, bytes).await?;
    out.face = Some(face);
    return Ok(());
}

/// Looks up the resource family and attaches its first registered face, when one exists.
pub async fn load_font_resource_from_name(
    host_font_loading: &HostFontLoadingCapability,
    out: &mut FontResource,
) -> Result<(), Unknown> {
    let faces = _load_font_faces_from_name(host_font_loading, &out.family).await?;
    if let Some(face) = faces.first() {
        out.face = Some(face.clone());
    }
    return Ok(());
}

/// Loads one unhinted URL source and attaches it only after loading and registration finish.
pub async fn load_font_resource_from_url(
    host_font_loading: &HostFontLoadingCapability,
    out: &mut FontResource,
    url: &str,
) -> Result<(), Unknown> {
    let face = _load_font_face_from_url(host_font_loading, &out.family, url).await?;
    out.face = Some(face);
    return Ok(());
}

/// Loads one composed URL source list and attaches it only after loading and registration finish.
pub async fn load_font_resource_from_urls(
    host_font_loading: &HostFontLoadingCapability,
    out: &mut FontResource,
    sources: &[FontUrl],
) -> Result<(), Unknown> {
    let face = _load_font_face_from_urls(host_font_loading, &out.family, sources).await?;
    out.face = Some(face);
    return Ok(());
}
