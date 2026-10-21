use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use crate::contract::*;

    fn test_bitmap() -> Bitmap {
        let mut out = create_bitmap(4, 4, Some(0x336699ff));
        set_bitmap_pixel(&mut out, 1, 1, 0x00000000);
        set_bitmap_pixel(&mut out, 2, 1, 0xff8000c0);
        return out;
    }

    fn test_encode(_source: &Bitmap, _format: ImageFormat, _quality: f32) -> Option<Vec<u8>> {
        return Some(vec![1, 2, 3]);
    }

    fn test_encoder() -> HostBitmapEncodeCapability {
        return HostBitmapEncodeCapability { encode_bitmap: test_encode, supported_formats: vec![ImageFormat::Png] };
    }

    #[test]
    fn hostbitmapencodecapability_encode_bitmap_matches_encode_bitmap() {
        let s = test_encoder();
        let ra = s.encode_bitmap(&test_bitmap(), Some(ImageFormat::Png), Some(0.9));
        let rb = encode_bitmap(&s, &test_bitmap(), Some(ImageFormat::Png), Some(0.9));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn hostbitmapencodecapability_explain_bitmap_encode_failure_matches_explain_bitmap_encode_failure() {
        let s = test_encoder();
        let ra = s.explain_bitmap_encode_failure(ImageFormat::Jpeg);
        let rb = explain_bitmap_encode_failure(&s, ImageFormat::Jpeg);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }
}

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

impl HostBitmapEncodeCapability {
    pub fn encode_bitmap(&self, source: &Bitmap, format: Option<ImageFormat>, quality: Option<f32>) -> Option<Vec<u8>> {
        return encode_bitmap(self, source, format, quality);
    }

    pub fn explain_bitmap_encode_failure(&self, format: ImageFormat) -> Option<BitmapEncodeFailureExplanation> {
        return explain_bitmap_encode_failure(self, format);
    }
}
