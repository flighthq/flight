use std::cell::RefCell;
use std::sync::Arc;

use flight_bitmap::contract::*;

thread_local! {
    static ENCODE_CALLS: RefCell<Vec<(u32, ImageFormat, f32)>> = RefCell::new(Vec::new());
}

fn recording_encoder(source: &Bitmap, format: ImageFormat, quality: f32) -> Box<[u8]> {
    ENCODE_CALLS.with(|c| c.borrow_mut().push((source.width, format, quality)));
    return vec![9, 8, 7].into_boxed_slice();
}

fn take_encode_calls() -> Vec<(u32, ImageFormat, f32)> {
    return ENCODE_CALLS.with(|c| std::mem::take(&mut *c.borrow_mut()));
}

fn failing_encoder(_source: &Bitmap, _format: ImageFormat, _quality: f32) -> Box<[u8]> {
    panic!("encode failed");
}

mod encode_bitmap {
    use super::*;

    #[test]
    fn returns_none_when_format_unsupported() {
        let host = HostBitmapEncodeCapability {
            provider: Arc::new(()),
            encode_bitmap: Arc::new(|_source, _format, _quality| vec![9, 8, 7].into_boxed_slice()),
            supported_formats: vec![ImageFormat::Png],
        };
        let bmp = create_bitmap(1, 1, None);
        assert!(encode_bitmap(&host, &bmp, Some(ImageFormat::Jpeg), Some(0.9)).is_none());
    }

    #[test]
    fn returns_encoded_bytes_for_supported_format() {
        let host = HostBitmapEncodeCapability {
            provider: Arc::new(()),
            encode_bitmap: Arc::new(|_source, _format, _quality| vec![9, 8, 7].into_boxed_slice()),
            supported_formats: vec![ImageFormat::Png, ImageFormat::Jpeg],
        };
        let bmp = create_bitmap(2, 2, Some(0x112233ff));
        let result = encode_bitmap(&host, &bmp, Some(ImageFormat::Png), Some(0.9));
        assert_eq!(result, Some(vec![9, 8, 7].into_boxed_slice()));
    }

    #[test]
    fn dispatches_the_default_png_format_and_quality_to_the_host_backend() {
        take_encode_calls();
        let host = HostBitmapEncodeCapability {
            provider: Arc::new(()),
            encode_bitmap: Arc::new(recording_encoder),
            supported_formats: vec![ImageFormat::Jpeg, ImageFormat::Png],
        };
        let source = create_bitmap(2, 2, Some(0x112233ff));
        assert_eq!(
            encode_bitmap(&host, &source, None, None),
            Some(vec![9, 8, 7].into_boxed_slice())
        );
        assert_eq!(take_encode_calls(), vec![(2, ImageFormat::Png, 0.9)]);
    }

    #[test]
    fn forwards_jpeg_and_caller_quality_unchanged() {
        take_encode_calls();
        let host = HostBitmapEncodeCapability {
            provider: Arc::new(()),
            encode_bitmap: Arc::new(recording_encoder),
            supported_formats: vec![ImageFormat::Jpeg, ImageFormat::Png],
        };
        encode_bitmap(
            &host,
            &create_bitmap(1, 1, None),
            Some(ImageFormat::Jpeg),
            Some(1.25),
        );
        assert_eq!(take_encode_calls(), vec![(1, ImageFormat::Jpeg, 1.25)]);
    }

    #[test]
    fn does_not_invoke_the_backend_when_the_format_is_unsupported() {
        take_encode_calls();
        let host = HostBitmapEncodeCapability {
            provider: Arc::new(()),
            encode_bitmap: Arc::new(recording_encoder),
            supported_formats: vec![ImageFormat::Png],
        };
        assert!(
            encode_bitmap(
                &host,
                &create_bitmap(1, 1, None),
                Some(ImageFormat::Jpeg),
                None
            )
            .is_none()
        );
        assert!(take_encode_calls().is_empty());
    }

    #[test]
    #[should_panic(expected = "encode failed")]
    fn propagates_genuine_supported_format_encoding_faults() {
        let host = HostBitmapEncodeCapability {
            provider: Arc::new(()),
            encode_bitmap: Arc::new(failing_encoder),
            supported_formats: vec![ImageFormat::Png],
        };
        encode_bitmap(&host, &create_bitmap(1, 1, None), None, None);
    }
}

mod explain_bitmap_encode_failure {
    use super::*;

    #[test]
    fn reports_unsupported_format() {
        let host = HostBitmapEncodeCapability {
            provider: Arc::new(()),
            encode_bitmap: Arc::new(|_source, _format, _quality| vec![].into_boxed_slice()),
            supported_formats: vec![ImageFormat::Png],
        };
        let result = explain_bitmap_encode_failure(&host, ImageFormat::Jpeg);
        assert!(result.is_some());
        let exp = result.unwrap();
        assert_eq!(exp.format, ImageFormat::Jpeg);
    }

    #[test]
    fn returns_none_for_supported_format() {
        let host = HostBitmapEncodeCapability {
            provider: Arc::new(()),
            encode_bitmap: Arc::new(|_source, _format, _quality| vec![].into_boxed_slice()),
            supported_formats: vec![ImageFormat::Png],
        };
        assert!(explain_bitmap_encode_failure(&host, ImageFormat::Png).is_none());
    }
}
