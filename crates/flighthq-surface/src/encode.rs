//! Surface encode / decode — PNG and JPEG byte buffers.

use flighthq_types::{ImageFormat, Surface};

/// Encodes `source` as an image byte buffer in the given format. `quality` is
/// used for JPEG (0.0..=1.0); it is ignored for PNG.
///
/// TODO(wave-N): the TS implementation encodes via an HTML canvas
/// (`canvas.toDataURL`). A native port needs a PNG/JPEG codec, which would add
/// an image-encoding dependency to this crate. Until that dependency is chosen
/// and measured against the bundle-size rules, this returns an empty buffer
/// (sentinel "not encoded") rather than panicking.
pub fn encode_surface(_source: &Surface, _format: ImageFormat, _quality: f32) -> Vec<u8> {
    Vec::new()
}

/// Decodes an image byte buffer (PNG, JPEG, etc.) into a `Surface`.
/// Returns `None` for malformed or unsupported input.
///
/// TODO(wave-N): mirrors `encode_surface` — a native decoder needs an
/// image-codec dependency. Until then this returns `None` (the documented
/// sentinel for unsupported input) for every input.
pub fn decode_surface(_data: &[u8]) -> Option<Surface> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::surface::create_surface;

    #[test]
    fn decode_surface_invalid_returns_none() {
        assert!(decode_surface(&[0u8, 1, 2, 3]).is_none());
    }

    #[test]
    fn encode_surface_pending_codec_returns_empty() {
        // TODO(wave-N): assert a real PNG round-trip once a codec dependency is
        // added; the canvas-based TS path has no native equivalent yet.
        let surface = create_surface(2, 2, 0x11223344);
        assert!(encode_surface(&surface, ImageFormat::Png, 0.9).is_empty());
    }
}
