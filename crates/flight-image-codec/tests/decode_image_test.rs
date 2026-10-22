use std::sync::{Arc, Mutex};

use flight_image_codec::*;

use crate::block_on;

const PNG_BYTES: [u8; 8] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

fn caps_png(slot: HostImageDecodeFormatCapability) -> HostImageDecodeCapabilities {
    return HostImageDecodeCapabilities {
        avif: None,
        bmp: None,
        gif: None,
        jpeg: None,
        png: Some(slot),
        webp: None,
    };
}

fn caps_jpeg(slot: HostImageDecodeFormatCapability) -> HostImageDecodeCapabilities {
    return HostImageDecodeCapabilities {
        avif: None,
        bmp: None,
        gif: None,
        jpeg: Some(slot),
        png: None,
        webp: None,
    };
}

fn fake_decoded() -> DecodedImage {
    return DecodedImage {
        data: vec![1, 2, 3, 4].into_boxed_slice(),
        height: 1,
        width: 1,
    };
}

struct DecodeCall {
    bytes: Vec<u8>,
    options: Option<ImageDecodeOptions>,
}

fn fake_slot() -> (HostImageDecodeFormatCapability, Arc<Mutex<Vec<DecodeCall>>>) {
    let calls: Arc<Mutex<Vec<DecodeCall>>> = Arc::new(Mutex::new(Vec::new()));
    let captured = calls.clone();
    let slot = HostImageDecodeFormatCapability {
        decode: Arc::new(move |bytes: Vec<u8>, options: Option<ImageDecodeOptions>| {
            captured.lock().unwrap().push(DecodeCall { bytes, options });
            let image = fake_decoded();
            return Box::pin(async move { image });
        }),
    };
    return (slot, calls);
}

mod decode_image {
    use super::*;

    #[test]
    fn auto_detects_the_mime_type_when_omitted_and_dispatches_to_the_capability_slot() {
        let (slot, calls) = fake_slot();
        let caps = caps_png(slot);
        let result = block_on(decode_image(&caps, &PNG_BYTES, None));
        assert_eq!(result, Some(fake_decoded()));
        let calls = calls.lock().unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].bytes, PNG_BYTES.to_vec());
        assert_eq!(calls[0].options, None);
    }

    #[test]
    fn uses_an_explicit_mime_type_over_detection() {
        let (slot, calls) = fake_slot();
        let caps = caps_jpeg(slot);
        block_on(decode_image(&caps, &PNG_BYTES, Some("image/jpeg")));
        assert_eq!(calls.lock().unwrap().len(), 1);
    }

    #[test]
    fn returns_none_when_no_slot_is_present_for_the_detected_type() {
        assert_eq!(
            block_on(decode_image(
                &HostImageDecodeCapabilities {
                    avif: None,
                    bmp: None,
                    gif: None,
                    jpeg: None,
                    png: None,
                    webp: None
                },
                &PNG_BYTES,
                None
            )),
            None
        );
    }

    #[test]
    fn returns_none_when_the_mime_type_cannot_be_determined() {
        let (slot, _calls) = fake_slot();
        let caps = caps_png(slot);
        assert_eq!(block_on(decode_image(&caps, &[0, 1, 2, 3], None)), None);
    }

    #[test]
    fn does_not_request_premultiplied_output() {
        let (slot, calls) = fake_slot();
        let caps = caps_png(slot);
        block_on(decode_image(&caps, &PNG_BYTES, None));
        assert_eq!(calls.lock().unwrap()[0].options, None);
    }
}

mod decode_image_premultiplied {
    use super::*;

    #[test]
    fn passes_premultiply_alpha_true_to_the_slot() {
        let (slot, calls) = fake_slot();
        let caps = caps_png(slot);
        block_on(decode_image_premultiplied(
            &caps,
            &PNG_BYTES,
            Some("image/png"),
        ));
        assert_eq!(
            calls.lock().unwrap()[0].options,
            Some(ImageDecodeOptions {
                premultiply_alpha: Some(true)
            })
        );
    }

    #[test]
    fn auto_detects_the_mime_type_when_omitted() {
        let (slot, calls) = fake_slot();
        let caps = caps_png(slot);
        assert_eq!(
            block_on(decode_image_premultiplied(&caps, &PNG_BYTES, None)),
            Some(fake_decoded())
        );
        assert_eq!(
            calls.lock().unwrap()[0].options,
            Some(ImageDecodeOptions {
                premultiply_alpha: Some(true)
            })
        );
    }

    #[test]
    fn returns_none_when_no_slot_is_present_for_the_detected_type() {
        assert_eq!(
            block_on(decode_image_premultiplied(
                &HostImageDecodeCapabilities {
                    avif: None,
                    bmp: None,
                    gif: None,
                    jpeg: None,
                    png: None,
                    webp: None
                },
                &PNG_BYTES,
                None
            )),
            None
        );
    }
}
