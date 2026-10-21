use crate::types::*;

struct BitmapEncodeResolution {
    format: ImageFormat,
    success: bool,
}

/// Encodes a bitmap to bytes using the host capability. `format` defaults to png and `quality`
/// to 0.9, as in TS.
pub fn encode_bitmap(
    host_bitmap_encode: &HostBitmapEncodeCapability,
    source: &Bitmap,
    format: Option<ImageFormat>,
    quality: Option<f32>,
) -> Option<Vec<u8>> {
    let resolution = resolve_bitmap_encode(host_bitmap_encode, format.unwrap_or(ImageFormat::Png));
    if !resolution.success {
        return None;
    }
    return (host_bitmap_encode.encode_bitmap)(source, resolution.format, quality.unwrap_or(0.9));
}

/// Explains why encoding would fail for a given format.
pub fn explain_bitmap_encode_failure(
    host_bitmap_encode: &HostBitmapEncodeCapability,
    format: ImageFormat,
) -> Option<BitmapEncodeFailureExplanation> {
    let resolution = resolve_bitmap_encode(host_bitmap_encode, format);
    if resolution.success {
        None
    } else {
        Some(BitmapEncodeFailureExplanation {
            format: resolution.format,
            reason: "format-unsupported".to_string(),
        })
    }
}

fn resolve_bitmap_encode(host: &HostBitmapEncodeCapability, format: ImageFormat) -> BitmapEncodeResolution {
    let normalized = match format {
        ImageFormat::Jpeg => ImageFormat::Jpeg,
        _ => ImageFormat::Png,
    };
    let supported = host.supported_formats.contains(&normalized);
    BitmapEncodeResolution {
        format: normalized,
        success: supported,
    }
}
