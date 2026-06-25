//! Image resource creation, mutation, and loading.
//!
//! An `ImageResource` is a backend-agnostic image handle: pixel dimensions,
//! a monotonically increasing version counter, and optional CPU pixel data.
//! Renderers own the GPU texture derived from this resource; the resource
//! itself holds no GPU handle. Bump `version` after mutating pixels so
//! backends know to re-upload.

use flighthq_types::{AlphaType, ImageResource, PixelFormat};

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/// Allocates a new `ImageResource` with zeroed dimensions and no data.
///
/// Pass raw pixel bytes if the image data is already available; pass `None`
/// when the pixels will be filled in later via `set_image_resource_data` or
/// loaded with `load_image_resource_from_bytes` / `load_image_resource_from_path`.
pub fn create_image_resource(
    width: u32,
    height: u32,
    data: Option<Vec<u8>>,
    format: PixelFormat,
    alpha_type: AlphaType,
) -> ImageResource {
    ImageResource {
        alpha_type,
        data,
        format,
        height,
        version: 0,
        width,
    }
}

/// Allocates a new resource identity over the same underlying pixels.
///
/// The `data` vec is cloned (shallow byte copy). The clone gets an independent
/// version counter so the same pixel bytes can be uploaded into two render
/// states with separate invalidation. To duplicate the actual pixels use a
/// Surface copy instead.
pub fn clone_image_resource(resource: &ImageResource) -> ImageResource {
    ImageResource {
        alpha_type: resource.alpha_type,
        data: resource.data.clone(),
        format: resource.format,
        height: resource.height,
        version: resource.version,
        width: resource.width,
    }
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

/// Returns the byte footprint of the CPU-side pixel data (`data`).
///
/// Returns `0` when `data` is `None` (element-only resource — the GPU texture
/// footprint is tracked by the render state, not here). For `rgba8unorm` (the
/// default) the result equals `width × height × 4`; other formats are not yet
/// exercised but the formula still applies (the actual buffer length is
/// authoritative).
pub fn get_image_resource_byte_size(resource: &ImageResource) -> usize {
    match resource.data.as_ref() {
        Some(data) => data.len(),
        None => 0,
    }
}

/// Returns `true` when the resource carries CPU pixel data.
pub fn has_image_resource_data(resource: &ImageResource) -> bool {
    resource.data.is_some()
}

/// Returns `true` when the resource has zero width or zero height.
pub fn is_image_resource_empty(resource: &ImageResource) -> bool {
    resource.width == 0 || resource.height == 0
}

// ---------------------------------------------------------------------------
// Mutation
// ---------------------------------------------------------------------------

/// Replaces the pixel data, updates dimensions to match, and bumps `version`.
///
/// Pass `None` to clear the data payload (dimensions are left intact).
pub fn set_image_resource_data(
    resource: &mut ImageResource,
    data: Option<Vec<u8>>,
    width: u32,
    height: u32,
    format: PixelFormat,
    alpha_type: AlphaType,
) {
    resource.data = data;
    resource.width = width;
    resource.height = height;
    resource.format = format;
    resource.alpha_type = alpha_type;
    invalidate_image_resource(resource);
}

/// Bumps `version` so renderer texture caches know the pixels changed.
///
/// Call this after mutating the backing bytes in place. Analogous to
/// `invalidateNodeLocalContent` in the scene graph.
pub fn invalidate_image_resource(resource: &mut ImageResource) {
    // Wrapping mirrors the TS `(version + 1) >>> 0` 32-bit wrap-around.
    resource.version = resource.version.wrapping_add(1);
}

/// Releases the pixel data so it becomes eligible for GC and marks the
/// resource changed.
///
/// Dimensions are left intact. Does not free any GPU texture — that is owned
/// per render state; call the backend's destroy function instead.
pub fn dispose_image_resource(resource: &mut ImageResource) {
    resource.data = None;
    invalidate_image_resource(resource);
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/// Detects an image MIME type from the first bytes of `buf`.
///
/// Returns the MIME type string (`"image/png"`, `"image/jpeg"`, etc.) or
/// `None` if the header is unrecognised.
pub fn detect_image_mime_type(buf: &[u8]) -> Option<&'static str> {
    if buf.len() < 4 {
        return None;
    }

    // PNG: 89 50 4E 47
    if buf[0] == 0x89 && buf[1] == 0x50 && buf[2] == 0x4e && buf[3] == 0x47 {
        return Some("image/png");
    }

    // JPEG: FF D8 FF
    if buf[0] == 0xff && buf[1] == 0xd8 && buf[2] == 0xff {
        return Some("image/jpeg");
    }

    // GIF87a / GIF89a: 47 49 46 38
    if buf[0] == 0x47 && buf[1] == 0x49 && buf[2] == 0x46 && buf[3] == 0x38 {
        return Some("image/gif");
    }

    // WebP: RIFF....WEBP (bytes 0-3 and 8-11)
    if buf.len() >= 12
        && buf[0] == 0x52
        && buf[1] == 0x49
        && buf[2] == 0x46
        && buf[3] == 0x46
        && buf[8] == 0x57
        && buf[9] == 0x45
        && buf[10] == 0x42
        && buf[11] == 0x50
    {
        return Some("image/webp");
    }

    // BMP: 42 4D
    if buf[0] == 0x42 && buf[1] == 0x4d {
        return Some("image/bmp");
    }

    None
}

/// Decodes `bytes` as an image (PNG, JPEG, WebP, BMP, GIF) and returns a
/// populated `ImageResource`.
///
/// `mime_type` is optional; when `None` the format is inferred via
/// `detect_image_mime_type`. Returns an error if decoding fails.
pub fn load_image_resource_from_bytes(
    bytes: &[u8],
    mime_type: Option<&str>,
) -> Result<ImageResource, Box<dyn std::error::Error + Send + Sync>> {
    // Mirror the TS contract: an undetectable type with no override is a hard
    // error before any decode is attempted.
    let _type = match mime_type {
        Some(t) => t,
        None => detect_image_mime_type(bytes).ok_or("Unable to determine image type from bytes")?,
    };
    // TODO(wave-N): wire an image decoder backend (e.g. the `image` crate). The
    // web port decodes via an HTMLImageElement; native decoding has no backend
    // yet, so we cannot turn encoded bytes into pixel data and dimensions here.
    Err("image decoding requires a decoder backend that is not yet wired".into())
}

/// Decodes the bytes of an array buffer as an image.
///
/// Alias of `load_image_resource_from_bytes` matching the web port's
/// `loadImageResourceFromArrayBuffer`. `mime_type` is optional; when `None` the
/// type is detected from magic bytes and an undetectable buffer is a hard error
/// before any decode is attempted.
pub fn load_image_resource_from_array_buffer(
    buffer: &[u8],
    mime_type: Option<&str>,
) -> Result<ImageResource, Box<dyn std::error::Error + Send + Sync>> {
    load_image_resource_from_bytes(buffer, mime_type)
}

/// Reads a file at `path` and decodes it as an image.
///
/// The format is inferred from the file extension and magic bytes.
/// Returns an error if the file cannot be read or decoded.
pub fn load_image_resource_from_path(
    path: &std::path::Path,
) -> Result<ImageResource, Box<dyn std::error::Error + Send + Sync>> {
    let bytes = std::fs::read(path)?;
    load_image_resource_from_bytes(&bytes, None)
}

/// Reads the file at `url` (treated as a local path on native) and decodes it.
///
/// Native has no `fetch`; a URL is resolved as a filesystem path. Returns an
/// error if the file cannot be read or decoded.
pub fn load_image_resource_from_url(
    url: &str,
) -> Result<ImageResource, Box<dyn std::error::Error + Send + Sync>> {
    load_image_resource_from_path(std::path::Path::new(url))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clone_image_resource_produces_independent_version() {
        let a = create_image_resource(4, 4, None, PixelFormat::Rgba8Unorm, AlphaType::Straight);
        let mut b = clone_image_resource(&a);
        invalidate_image_resource(&mut b);
        assert_ne!(a.version, b.version);
    }

    #[test]
    fn create_image_resource_defaults() {
        let r = create_image_resource(0, 0, None, PixelFormat::Rgba8Unorm, AlphaType::Straight);
        assert!(is_image_resource_empty(&r));
        assert!(!has_image_resource_data(&r));
    }

    #[test]
    fn clone_image_resource_shares_field_values() {
        let a = create_image_resource(
            4,
            5,
            Some(vec![1, 2, 3, 4]),
            PixelFormat::Bgra8Unorm,
            AlphaType::Premultiplied,
        );
        let b = clone_image_resource(&a);
        assert_eq!(b.width, 4);
        assert_eq!(b.height, 5);
        assert_eq!(b.format, PixelFormat::Bgra8Unorm);
        assert_eq!(b.alpha_type, AlphaType::Premultiplied);
        assert_eq!(b.data.as_deref(), Some(&[1u8, 2, 3, 4][..]));
    }

    #[test]
    fn detect_image_mime_type_bmp() {
        let bmp_header: &[u8] = &[0x42, 0x4d, 0x00, 0x00];
        assert_eq!(detect_image_mime_type(bmp_header), Some("image/bmp"));
    }

    #[test]
    fn detect_image_mime_type_gif() {
        let gif_header: &[u8] = &[0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
        assert_eq!(detect_image_mime_type(gif_header), Some("image/gif"));
    }

    #[test]
    fn detect_image_mime_type_jpeg() {
        let jpeg_header: &[u8] = &[0xff, 0xd8, 0xff, 0xe0];
        assert_eq!(detect_image_mime_type(jpeg_header), Some("image/jpeg"));
    }

    #[test]
    fn detect_image_mime_type_none_for_short_buffer() {
        assert_eq!(detect_image_mime_type(&[0x00, 0x01]), None);
    }

    #[test]
    fn detect_image_mime_type_none_for_unrecognized() {
        assert_eq!(detect_image_mime_type(&[0x00, 0x01, 0x02, 0x03]), None);
    }

    #[test]
    fn detect_image_mime_type_png() {
        let png_header: &[u8] = &[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        assert_eq!(detect_image_mime_type(png_header), Some("image/png"));
    }

    #[test]
    fn detect_image_mime_type_webp() {
        let webp_header: &[u8] = &[
            0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
        ];
        assert_eq!(detect_image_mime_type(webp_header), Some("image/webp"));
    }

    #[test]
    fn dispose_image_resource_clears_data() {
        let data = vec![0u8; 16];
        let mut r = create_image_resource(
            2,
            2,
            Some(data),
            PixelFormat::Rgba8Unorm,
            AlphaType::Straight,
        );
        dispose_image_resource(&mut r);
        assert!(!has_image_resource_data(&r));
    }

    #[test]
    fn get_image_resource_byte_size_zero_when_no_data() {
        let r = create_image_resource(0, 0, None, PixelFormat::Rgba8Unorm, AlphaType::Straight);
        assert_eq!(get_image_resource_byte_size(&r), 0);
    }

    #[test]
    fn get_image_resource_byte_size_returns_data_len() {
        let r = create_image_resource(
            0,
            0,
            Some(vec![0u8; 100]),
            PixelFormat::Rgba8Unorm,
            AlphaType::Straight,
        );
        assert_eq!(get_image_resource_byte_size(&r), 100);
    }

    #[test]
    fn get_image_resource_byte_size_reflects_width_height_times_4() {
        // 4×4 rgba8unorm → 4 × 4 × 4 = 64 bytes.
        let r = create_image_resource(
            4,
            4,
            Some(vec![0u8; 4 * 4 * 4]),
            PixelFormat::Rgba8Unorm,
            AlphaType::Straight,
        );
        assert_eq!(get_image_resource_byte_size(&r), 64);
    }

    #[test]
    fn has_image_resource_data_true_when_present() {
        let data = vec![0u8; 16];
        let r = create_image_resource(
            2,
            2,
            Some(data),
            PixelFormat::Rgba8Unorm,
            AlphaType::Straight,
        );
        assert!(has_image_resource_data(&r));
    }

    #[test]
    fn invalidate_image_resource_bumps_version() {
        let mut r = create_image_resource(1, 1, None, PixelFormat::Rgba8Unorm, AlphaType::Straight);
        let v0 = r.version;
        invalidate_image_resource(&mut r);
        assert_ne!(r.version, v0);
    }

    #[test]
    fn invalidate_image_resource_wraps_at_u32_max() {
        let mut r = create_image_resource(1, 1, None, PixelFormat::Rgba8Unorm, AlphaType::Straight);
        r.version = u32::MAX;
        invalidate_image_resource(&mut r);
        assert_eq!(r.version, 0);
    }

    #[test]
    fn load_image_resource_from_array_buffer_errors_without_type() {
        // Mirrors TS: undetectable type with no override throws before decode.
        let buffer: &[u8] = &[0x00, 0x01, 0x02, 0x03];
        let result = load_image_resource_from_array_buffer(buffer, None);
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Unable to determine image type"));
    }

    #[test]
    fn load_image_resource_from_array_buffer_bypasses_detection_with_mime() {
        // Mirrors TS "uses the provided mimeType and bypasses detection": with a
        // mime override, detection is skipped — the decoder backend is the only
        // remaining blocker on native.
        let buffer: &[u8] = &[0x00, 0x00, 0x00, 0x00];
        let result = load_image_resource_from_array_buffer(buffer, Some("image/png"));
        let err = result.unwrap_err().to_string();
        assert!(!err.contains("Unable to determine image type"));
        assert!(err.contains("decoder backend"));
    }

    #[test]
    fn load_image_resource_from_bytes_errors_without_type() {
        let bytes: &[u8] = &[0x00, 0x01, 0x02, 0x03];
        let result = load_image_resource_from_bytes(bytes, None);
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Unable to determine image type"));
    }

    #[test]
    fn load_image_resource_from_url_errors_when_missing() {
        let result = load_image_resource_from_url("does-not-exist-flighthq-image.png");
        assert!(result.is_err());
    }

    #[test]
    fn is_image_resource_empty_false_when_sized() {
        let r = create_image_resource(4, 4, None, PixelFormat::Rgba8Unorm, AlphaType::Straight);
        assert!(!is_image_resource_empty(&r));
    }

    #[test]
    fn set_image_resource_data_updates_dimensions_and_version() {
        let mut r = create_image_resource(0, 0, None, PixelFormat::Rgba8Unorm, AlphaType::Straight);
        let v0 = r.version;
        let data = vec![0u8; 16];
        set_image_resource_data(
            &mut r,
            Some(data),
            2,
            2,
            PixelFormat::Rgba8Unorm,
            AlphaType::Straight,
        );
        assert_eq!(r.width, 2);
        assert_eq!(r.height, 2);
        assert_ne!(r.version, v0);
    }
}
