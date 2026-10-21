use std::sync::{Arc, Mutex};

use flight_image_codec::*;

use crate::block_on;

fn caps_png(slot: HostImageEncodeFormatCapability) -> HostImageEncodeCapabilities {
    return HostImageEncodeCapabilities { jpeg: None, png: Some(slot), webp: None };
}

fn caps_jpeg(slot: HostImageEncodeFormatCapability) -> HostImageEncodeCapabilities {
    return HostImageEncodeCapabilities { jpeg: Some(slot), png: None, webp: None };
}

fn fake_image() -> DecodedImage {
    return DecodedImage {
        data: vec![1, 2, 3, 4].into_boxed_slice(),
        height: 1,
        width: 1,
    };
}

struct EncodeCall {
    image: DecodedImage,
    options: Option<ImageEncodeOptions>,
}

fn fake_slot(result: Box<[u8]>) -> (HostImageEncodeFormatCapability, Arc<Mutex<Vec<EncodeCall>>>) {
    let calls: Arc<Mutex<Vec<EncodeCall>>> = Arc::new(Mutex::new(Vec::new()));
    let captured = calls.clone();
    let slot = HostImageEncodeFormatCapability {
        encode: Arc::new(move |image: DecodedImage, options: Option<ImageEncodeOptions>| {
            captured.lock().unwrap().push(EncodeCall { image, options });
            let bytes = result.clone();
            return Box::pin(async move { bytes });
        }),
    };
    return (slot, calls);
}

mod encode_image {
    use super::*;

    #[test]
    fn dispatches_to_the_capability_slot_and_returns_its_bytes() {
        let bytes: Box<[u8]> = vec![9, 8, 7].into_boxed_slice();
        let (slot, calls) = fake_slot(bytes.clone());
        let caps = caps_png(slot);
        let image = fake_image();
        let result = block_on(encode_image(&caps, &image, "image/png", None));
        assert_eq!(result, Some(bytes));
        let calls = calls.lock().unwrap();
        assert_eq!(calls[0].image, image);
        assert_eq!(calls[0].options, None);
    }

    #[test]
    fn forwards_encode_options_to_the_slot() {
        let (slot, calls) = fake_slot(Vec::new().into_boxed_slice());
        let caps = caps_jpeg(slot);
        block_on(encode_image(
            &caps,
            &fake_image(),
            "image/jpeg",
            Some(&ImageEncodeOptions { quality: Some(0.5) }),
        ));
        assert_eq!(
            calls.lock().unwrap()[0].options,
            Some(ImageEncodeOptions { quality: Some(0.5) })
        );
    }

    #[test]
    fn returns_none_when_no_slot_is_present_for_the_mime_type() {
        assert_eq!(
            block_on(encode_image(
                &HostImageEncodeCapabilities { jpeg: None, png: None, webp: None },
                &fake_image(),
                "image/png",
                None
            )),
            None
        );
    }
}
