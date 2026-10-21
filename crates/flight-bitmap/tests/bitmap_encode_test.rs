use flight_bitmap::*;

mod encode_bitmap_fn {
    use super::*;

    #[test]
    fn returns_none_when_format_unsupported() {
        let host = HostBitmapEncodeCapability {
            encode_bitmap: |_source, _format, _quality| Some(vec![9, 8, 7]),
            supported_formats: vec![ImageFormat::Png],
        };
        let bmp = create_bitmap(1, 1, None);
        assert!(encode_bitmap(&host, &bmp, ImageFormat::Jpeg, 0.9).is_none());
    }

    #[test]
    fn returns_encoded_bytes_for_supported_format() {
        let host = HostBitmapEncodeCapability {
            encode_bitmap: |_source, _format, _quality| Some(vec![9, 8, 7]),
            supported_formats: vec![ImageFormat::Png, ImageFormat::Jpeg],
        };
        let bmp = create_bitmap(2, 2, Some(0x112233ff));
        let result = encode_bitmap(&host, &bmp, ImageFormat::Png, 0.9);
        assert_eq!(result, Some(vec![9, 8, 7]));
    }
}

mod explain_bitmap_encode_failure_fn {
    use super::*;

    #[test]
    fn reports_unsupported_format() {
        let host = HostBitmapEncodeCapability {
            encode_bitmap: |_source, _format, _quality| Some(vec![]),
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
            encode_bitmap: |_source, _format, _quality| Some(vec![]),
            supported_formats: vec![ImageFormat::Png],
        };
        assert!(explain_bitmap_encode_failure(&host, ImageFormat::Png).is_none());
    }
}
