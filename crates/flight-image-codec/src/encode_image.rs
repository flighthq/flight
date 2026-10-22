
use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::test_support::block_on;
    use std::sync::{Arc, Mutex};

    fn image() -> DecodedImage {
        return DecodedImage {
            data: vec![1, 2, 3, 4].into_boxed_slice(),
            height: 1,
            width: 1,
        };
    }

    fn caps(seen: &Arc<Mutex<Vec<Option<ImageEncodeOptions>>>>) -> HostImageEncodeCapabilities {
        let captured = seen.clone();
        let slot = HostImageEncodeFormatCapability {
            encode: Arc::new(move |_image: DecodedImage, options: Option<ImageEncodeOptions>| {
                captured.lock().unwrap().push(options);
                let bytes: Box<[u8]> = vec![9, 8, 7].into_boxed_slice();
                return Box::pin(async move { bytes });
            }),
        };
        return HostImageEncodeCapabilities {
            png: Some(slot),
            ..HostImageEncodeCapabilities::default()
        };
    }

    #[test]
    fn encode_image_method_matches_the_free_function() {
        let method_seen = Arc::new(Mutex::new(Vec::new()));
        let free_seen = Arc::new(Mutex::new(Vec::new()));
        let method_caps = caps(&method_seen);
        let free_caps = caps(&free_seen);
        let options = ImageEncodeOptions { quality: Some(0.5) };
        let via_method = block_on(method_caps.encode_image(&image(), "image/png", Some(&options)));
        let via_free = block_on(encode_image(&free_caps, &image(), "image/png", Some(&options)));
        assert_eq!(via_method, via_free);
        assert_eq!(*method_seen.lock().unwrap(), *free_seen.lock().unwrap());
    }
}

/// Encode a decoded image through the matching host capability slot. Returns None when the MIME
/// type has no registered encoder slot.
pub async fn encode_image(
    image_encode: &HostImageEncodeCapabilities,
    image: &DecodedImage,
    mime_type: &str,
    options: Option<&ImageEncodeOptions>,
) -> Option<Box<[u8]>> {
    let slot = get_image_encode_slot(image_encode, mime_type)?;
    return Some((slot.encode)(image.clone(), options.cloned()).await);
}

fn get_image_encode_slot<'a>(
    image_encode: &'a HostImageEncodeCapabilities,
    mime_type: &str,
) -> Option<&'a HostImageEncodeFormatCapability> {
    return match mime_type {
        "image/jpeg" => image_encode.jpeg.as_ref(),
        "image/png" => image_encode.png.as_ref(),
        "image/webp" => image_encode.webp.as_ref(),
        _ => None,
    };
}

impl HostImageEncodeCapabilities {
    pub async fn encode_image(
        &self,
        image: &DecodedImage,
        mime_type: &str,
        options: Option<&ImageEncodeOptions>,
    ) -> Option<Box<[u8]>> {
        return encode_image(self, image, mime_type, options).await;
    }
}

