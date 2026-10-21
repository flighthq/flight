use std::sync::Arc;

use flight_buffer::ArrayBufferView;
use flight_entity::Unknown;

use crate::font_format::infer_font_format_from_url;
use crate::font_shorthand::get_font_shorthand;
use crate::types::*;

/// Constructs, loads and registers one face from exactly the supplied byte-view window.
// flight-lint: allow(conform-extra) exact pinned contract-only leading-underscore export is intentionally omitted by the conformance scanner
pub async fn _load_font_face_from_bytes(
    backend: &HostFontLoadingCapability,
    family: &str,
    bytes: &ArrayBufferView,
) -> Result<Arc<FontFace>, Unknown> {
    return load_and_register_font_face(
        backend,
        family,
        FontFaceSource::Data(FontFaceSourceData {
            value: bytes.clone(),
        }),
    )
    .await;
}

/// Constructs, loads and registers one face from a single unhinted CSS `url(...)` source.
// flight-lint: allow(conform-extra) exact pinned contract-only leading-underscore export is intentionally omitted by the conformance scanner
pub async fn _load_font_face_from_url(
    backend: &HostFontLoadingCapability,
    family: &str,
    url: &str,
) -> Result<Arc<FontFace>, Unknown> {
    return load_and_register_font_face(
        backend,
        family,
        FontFaceSource::Url(FontFaceSourceUrl {
            value: format!("url({url})"),
        }),
    )
    .await;
}

/// Constructs, loads and registers one face from a comma-separated CSS source list.
// flight-lint: allow(conform-extra) exact pinned contract-only leading-underscore export is intentionally omitted by the conformance scanner
pub async fn _load_font_face_from_urls(
    backend: &HostFontLoadingCapability,
    family: &str,
    sources: &[FontUrl],
) -> Result<Arc<FontFace>, Unknown> {
    let source = sources
        .iter()
        .map(|source| {
            let format = source
                .format
                .as_deref()
                .or_else(|| infer_font_format_from_url(&source.url));
            return match format {
                Some(format) => format!("url({}) format('{format}')", source.url),
                None => format!("url({})", source.url),
            };
        })
        .collect::<Vec<_>>()
        .join(", ");
    return load_and_register_font_face(
        backend,
        family,
        FontFaceSource::Url(FontFaceSourceUrl { value: source }),
    )
    .await;
}

/// Finds already-registered faces for a family without constructing or registering a new face.
// flight-lint: allow(conform-extra) exact pinned contract-only leading-underscore export is intentionally omitted by the conformance scanner
pub async fn _load_font_faces_from_name(
    backend: &HostFontLoadingCapability,
    family: &str,
) -> Result<Vec<Arc<FontFace>>, Unknown> {
    return (backend.load_font_faces)(&get_font_shorthand(family, None)).await;
}

async fn load_and_register_font_face(
    backend: &HostFontLoadingCapability,
    family: &str,
    source: FontFaceSource,
) -> Result<Arc<FontFace>, Unknown> {
    let face = (backend.create_font_face)(family, &source);
    (backend.load_font_face)(&face).await?;
    (backend.add_font_face)(&face);
    return Ok(face);
}
