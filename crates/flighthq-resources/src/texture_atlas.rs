//! Texture atlas creation and loading.
//!
//! A `TextureAtlas` pairs one `ImageResource` with a list of named/indexed
//! `TextureAtlasRegion` values. Regions are mutated via the
//! `texture_atlas_region` module.

use flighthq_types::{ImageResource, TextureAtlas, TextureAtlasRegion};

use crate::image_resource::{
    load_image_resource_from_bytes, load_image_resource_from_path, load_image_resource_from_url,
};

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/// Creates a `TextureAtlas` with the given image and regions.
///
/// Pass `None` for `image` and an empty `Vec` for `regions` to create an
/// empty atlas that is populated later.
pub fn create_texture_atlas(
    image: Option<ImageResource>,
    regions: Vec<TextureAtlasRegion>,
) -> TextureAtlas {
    TextureAtlas { image, regions }
}

/// Creates a `TextureAtlas` backed by an existing `ImageResource`.
///
/// Regions are initially empty; use `add_texture_atlas_region*` to populate.
pub fn create_texture_atlas_from_image_resource(image: ImageResource) -> TextureAtlas {
    create_texture_atlas(Some(image), Vec::new())
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/// Decodes the bytes of an array buffer and wraps the image in a `TextureAtlas`.
///
/// Alias of `load_texture_atlas_from_bytes` matching the web port's
/// `loadTextureAtlasFromArrayBuffer`. `mime_type` is optional; an undetectable
/// buffer is a hard error before any decode is attempted.
pub fn load_texture_atlas_from_array_buffer(
    buffer: &[u8],
    mime_type: Option<&str>,
) -> Result<TextureAtlas, Box<dyn std::error::Error + Send + Sync>> {
    load_texture_atlas_from_bytes(buffer, mime_type)
}

/// Decodes `bytes` as an image and wraps it in a `TextureAtlas` with no
/// regions.
///
/// `mime_type` is optional; when `None` the format is inferred from magic
/// bytes. Returns an error if decoding fails.
pub fn load_texture_atlas_from_bytes(
    bytes: &[u8],
    mime_type: Option<&str>,
) -> Result<TextureAtlas, Box<dyn std::error::Error + Send + Sync>> {
    Ok(create_texture_atlas_from_image_resource(
        load_image_resource_from_bytes(bytes, mime_type)?,
    ))
}

/// Reads a file at `path`, decodes it as an image, and wraps it in a
/// `TextureAtlas` with no regions.
///
/// Returns an error if the file cannot be read or decoded.
pub fn load_texture_atlas_from_path(
    path: &std::path::Path,
) -> Result<TextureAtlas, Box<dyn std::error::Error + Send + Sync>> {
    Ok(create_texture_atlas_from_image_resource(
        load_image_resource_from_path(path)?,
    ))
}

/// Reads the file at `url` (treated as a local path on native), decodes it, and
/// wraps the image in a `TextureAtlas` with no regions.
///
/// Native has no `fetch`; a URL is resolved as a filesystem path. Returns an
/// error if the file cannot be read or decoded.
pub fn load_texture_atlas_from_url(
    url: &str,
) -> Result<TextureAtlas, Box<dyn std::error::Error + Send + Sync>> {
    Ok(create_texture_atlas_from_image_resource(
        load_image_resource_from_url(url)?,
    ))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_texture_atlas_empty() {
        let a = create_texture_atlas(None, vec![]);
        assert!(a.image.is_none());
        assert!(a.regions.is_empty());
    }

    #[test]
    fn create_texture_atlas_from_image_resource_no_regions() {
        use flighthq_types::{AlphaType, PixelFormat};
        let img = crate::image_resource::create_image_resource(
            4,
            4,
            None,
            PixelFormat::Rgba8Unorm,
            AlphaType::Straight,
        );
        let atlas = create_texture_atlas_from_image_resource(img);
        assert!(atlas.image.is_some());
        assert!(atlas.regions.is_empty());
    }

    #[test]
    fn load_texture_atlas_from_array_buffer_errors_without_type() {
        // Mirrors TS: undetectable mime type throws before decode.
        let buffer: &[u8] = &[0x00, 0x00, 0x00, 0x00];
        let result = load_texture_atlas_from_array_buffer(buffer, None);
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Unable to determine image type"));
    }

    #[test]
    fn load_texture_atlas_from_url_errors_when_missing() {
        let result = load_texture_atlas_from_url("does-not-exist-flighthq-atlas.png");
        assert!(result.is_err());
    }
}
