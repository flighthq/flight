use flight_entity::Uint8Array;

use crate::detect_image_mime_type::detect_image_mime_type;
use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::test_support::block_on;
    use std::sync::{Arc, Mutex};

    const PNG_BYTES: [u8; 8] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

    fn image() -> DecodedImage {
        return DecodedImage {
            data: vec![1, 2, 3, 4].into_boxed_slice(),
            height: 1,
            width: 1,
        };
    }

    fn caps(seen: &Arc<Mutex<Vec<Option<ImageDecodeOptions>>>>) -> HostImageDecodeCapabilities {
        let captured = seen.clone();
        let slot = HostImageDecodeFormatCapability {
            decode: Arc::new(move |_bytes: Vec<u8>, options: Option<ImageDecodeOptions>| {
                captured.lock().unwrap().push(options);
                let out = image();
                return Box::pin(async move { out });
            }),
        };
        return HostImageDecodeCapabilities {
            png: Some(slot),
            ..HostImageDecodeCapabilities::default()
        };
    }

    #[test]
    fn decode_image_method_matches_the_free_function() {
        let method_seen = Arc::new(Mutex::new(Vec::new()));
        let free_seen = Arc::new(Mutex::new(Vec::new()));
        let method_caps = caps(&method_seen);
        let free_caps = caps(&free_seen);
        let via_method = block_on(method_caps.decode_image(&PNG_BYTES, None));
        let via_free = block_on(decode_image(&free_caps, &PNG_BYTES, None));
        assert_eq!(via_method, via_free);
        assert_eq!(*method_seen.lock().unwrap(), *free_seen.lock().unwrap());
    }

    #[test]
    fn decode_image_premultiplied_method_matches_the_free_function() {
        let method_seen = Arc::new(Mutex::new(Vec::new()));
        let free_seen = Arc::new(Mutex::new(Vec::new()));
        let method_caps = caps(&method_seen);
        let free_caps = caps(&free_seen);
        let via_method = block_on(method_caps.decode_image_premultiplied(&PNG_BYTES, None));
        let via_free = block_on(decode_image_premultiplied(&free_caps, &PNG_BYTES, None));
        assert_eq!(via_method, via_free);
        assert_eq!(*method_seen.lock().unwrap(), *free_seen.lock().unwrap());
    }
}


/// Decode image bytes through the matching host capability slot. `mime_type` overrides detection
/// when supplied. Returns None when the type is unknown or no slot is registered.
pub async fn decode_image(
    image_decode: &HostImageDecodeCapabilities,
    bytes: &Uint8Array,
    mime_type: Option<&str>,
) -> Option<DecodedImage> {
    let slot = resolve_decode_slot(image_decode, bytes, mime_type)?;
    return Some((slot.decode)(bytes.to_vec(), None).await);
}

/// Decode with premultiplied alpha requested from the slot.
pub async fn decode_image_premultiplied(
    image_decode: &HostImageDecodeCapabilities,
    bytes: &Uint8Array,
    mime_type: Option<&str>,
) -> Option<DecodedImage> {
    let slot = resolve_decode_slot(image_decode, bytes, mime_type)?;
    let options = ImageDecodeOptions {
        premultiply_alpha: Some(true),
    };
    return Some((slot.decode)(bytes.to_vec(), Some(options)).await);
}

fn get_image_decode_slot<'a>(
    image_decode: &'a HostImageDecodeCapabilities,
    mime_type: &str,
) -> Option<&'a HostImageDecodeFormatCapability> {
    return match mime_type {
        "image/avif" => image_decode.avif.as_ref(),
        "image/bmp" => image_decode.bmp.as_ref(),
        "image/gif" => image_decode.gif.as_ref(),
        "image/jpeg" => image_decode.jpeg.as_ref(),
        "image/png" => image_decode.png.as_ref(),
        "image/webp" => image_decode.webp.as_ref(),
        _ => None,
    };
}

fn resolve_decode_slot<'a>(
    image_decode: &'a HostImageDecodeCapabilities,
    bytes: &[u8],
    mime_type: Option<&str>,
) -> Option<&'a HostImageDecodeFormatCapability> {
    let mime = match mime_type {
        Some(mime) => mime.to_string(),
        None => detect_image_mime_type(bytes)?,
    };
    return get_image_decode_slot(image_decode, &mime);
}


// ============================================================================
// D18 sugar: methods on the capability record delegate to the contract
// ============================================================================

impl HostImageDecodeCapabilities {
    pub async fn decode_image(&self, bytes: &Uint8Array, mime_type: Option<&str>) -> Option<DecodedImage> {
        return decode_image(self, bytes, mime_type).await;
    }

    pub async fn decode_image_premultiplied(
        &self,
        bytes: &Uint8Array,
        mime_type: Option<&str>,
    ) -> Option<DecodedImage> {
        return decode_image_premultiplied(self, bytes, mime_type).await;
    }
}


